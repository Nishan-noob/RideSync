import { useEffect, useRef, type MutableRefObject } from 'react'

import type {
  ClientToServerEvents,
  RideRole,
  ServerToClientEvents,
} from '@ridesync/shared'
import { io, type Socket } from 'socket.io-client'

import { SOCKET_URL } from '../config'
import { useAppDispatch } from '../store/hooks'
import {
  memberJoined,
  memberLeft,
  replaceSnapshot,
  setConnectionStatus,
  setRideError,
  telemetryUpdated,
  waypointAdded,
  waypointRemoved,
} from '../store/slices/rideSlice'

type RideSocket = Socket<ServerToClientEvents, ClientToServerEvents>

type UseRideSocketArgs = {
  rideId: string
  inviteToken: string
  userId: string
  displayName: string
  role: RideRole
}

export function useRideSocket({
  rideId,
  inviteToken,
  userId,
  displayName,
  role,
}: UseRideSocketArgs): MutableRefObject<RideSocket | null> {
  const dispatch = useAppDispatch()
  const socketRef = useRef<RideSocket | null>(null)

  useEffect(() => {
    if (!rideId || !inviteToken || !userId || !displayName) {
      return
    }

    dispatch(setConnectionStatus('connecting'))

    const socket = io(SOCKET_URL, {
      withCredentials: false,
      reconnection: true,
      reconnectionAttempts: 20,
      timeout: 10_000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      dispatch(setConnectionStatus('connected'))
      socket.emit('ride:join', {
        rideId,
        inviteToken,
        userId,
        displayName,
        role,
      })
    })

    socket.on('disconnect', () => {
      dispatch(setConnectionStatus('idle'))
    })

    socket.on('connect_error', (error) => {
      dispatch(setConnectionStatus('error'))
      dispatch(setRideError(`Socket connect error: ${error.message}`))
    })

    socket.on('ride:error', (payload) => {
      dispatch(setRideError(payload.message))
    })

    socket.on('ride:snapshot', (payload) => {
      dispatch(replaceSnapshot(payload))
    })

    socket.on('ride:member-joined', (payload) => {
      dispatch(memberJoined(payload))
    })

    socket.on('ride:member-left', (payload) => {
      dispatch(memberLeft(payload))
    })

    socket.on('telemetry:updated', (payload) => {
      dispatch(telemetryUpdated(payload))
    })

    socket.on('waypoint:added', (payload) => {
      dispatch(waypointAdded(payload))
    })

    socket.on('waypoint:removed', (payload) => {
      dispatch(waypointRemoved(payload))
    })

    socket.on('ride:closed', () => {
      dispatch(setRideError('This ride has been closed by the organizer.'))
    })

    return () => {
      socket.emit('ride:leave', { rideId, userId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [dispatch, displayName, inviteToken, rideId, role, userId])

  return socketRef
}
