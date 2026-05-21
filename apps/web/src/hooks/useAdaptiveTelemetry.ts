import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react'

import type { ClientToServerEvents, Coordinate, ServerToClientEvents } from '@ridesync/shared'
import type { Socket } from 'socket.io-client'

import { useAppDispatch, useAppSelector } from '../store/hooks'
import { enqueueTelemetry, markTelemetrySent } from '../store/slices/telemetrySlice'
import { setRideError } from '../store/slices/rideSlice'
import { distanceMeters } from '../utils/geo'

type RideSocket = Socket<ServerToClientEvents, ClientToServerEvents>

type UseAdaptiveTelemetryArgs = {
  rideId: string
  userId: string
  isSharing: boolean
  isRideJoined: boolean
  socketRef: MutableRefObject<RideSocket | null>
}

type LastSample = {
  lat: number
  lng: number
  recordedAt: number
}

const SIMULATED_START = {
  lat: 12.9716,
  lng: 77.5946,
}

export function useAdaptiveTelemetry({
  rideId,
  userId,
  isSharing,
  isRideJoined,
  socketRef,
}: UseAdaptiveTelemetryArgs): void {
  const dispatch = useAppDispatch()
  const queue = useAppSelector((state) => state.telemetry.queue)

  const pending = useMemo(() => queue.filter((item) => !item.sent), [queue])
  const lastSampleRef = useRef<LastSample | null>(null)

  const queueSample = useCallback(
    (coordinate: Coordinate) => {
      dispatch(
        enqueueTelemetry({
          rideId,
          userId,
          position: coordinate,
        }),
      )
    },
    [dispatch, rideId, userId],
  )

  useEffect(() => {
    if (!isSharing || !isRideJoined || !rideId || !userId) {
      return
    }

    if (import.meta.env.DEV && !window.isSecureContext) {
      dispatch(
        setRideError(
          'Running on HTTP. Using demo telemetry for testing. Use HTTPS in production for real GPS.',
        ),
      )

      const intervalId = window.setInterval(() => {
        const last = lastSampleRef.current ?? {
          ...SIMULATED_START,
          recordedAt: Date.now(),
        }

        const driftLat = (Math.random() - 0.5) * 0.0005
        const driftLng = (Math.random() - 0.5) * 0.0005

        const coordinate: Coordinate = {
          lat: last.lat + driftLat,
          lng: last.lng + driftLng,
          accuracyM: 12,
          speedKmh: 25,
          recordedAt: Date.now(),
        }

        lastSampleRef.current = {
          lat: coordinate.lat,
          lng: coordinate.lng,
          recordedAt: coordinate.recordedAt,
        }

        queueSample(coordinate)
      }, 4_000)

      return () => {
        window.clearInterval(intervalId)
      }
    }

    if (!navigator.geolocation) {
      dispatch(setRideError('Geolocation is not available in this browser.'))
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const speedKmh =
          typeof position.coords.speed === 'number' && !Number.isNaN(position.coords.speed)
            ? Math.max(position.coords.speed * 3.6, 0)
            : undefined

        const coordinate: Coordinate = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          headingDeg:
            typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)
              ? position.coords.heading
              : undefined,
          speedKmh,
          recordedAt: Math.trunc(position.timestamp),
        }

        const lastSample = lastSampleRef.current
        const intervalMs = speedKmh && speedKmh > 30 ? 2_500 : speedKmh && speedKmh > 12 ? 4_500 : 9_000

        if (lastSample) {
          const elapsedMs = coordinate.recordedAt - lastSample.recordedAt
          const movedMeters = distanceMeters(
            coordinate.lat,
            coordinate.lng,
            lastSample.lat,
            lastSample.lng,
          )

          if (elapsedMs < intervalMs && movedMeters < 18) {
            return
          }
        }

        lastSampleRef.current = {
          lat: coordinate.lat,
          lng: coordinate.lng,
          recordedAt: coordinate.recordedAt,
        }

        queueSample(coordinate)
      },
      (error) => {
        dispatch(setRideError(`Location error: ${error.message}`))
      },
      {
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 4_000,
      },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [dispatch, isRideJoined, isSharing, queueSample, rideId, userId])

  useEffect(() => {
    if (pending.length === 0) {
      return
    }

    const socket = socketRef.current

    if (!isRideJoined || !socket || !socket.connected) {
      return
    }

    for (const sample of pending) {
      socket.emit('telemetry:update', {
        rideId: sample.rideId,
        userId: sample.userId,
        position: sample.position,
      })
    }

    dispatch(markTelemetrySent(pending.map((sample) => sample.clientId)))
  }, [dispatch, isRideJoined, pending, socketRef])
}
