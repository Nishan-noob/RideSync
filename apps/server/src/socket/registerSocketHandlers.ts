import {
  rideClosePayloadSchema,
  joinRidePayloadSchema,
  leaveRidePayloadSchema,
  telemetryUpdatePayloadSchema,
  waypointAddPayloadSchema,
  waypointRemovePayloadSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@ridesync/shared'
import type { Server } from 'socket.io'

import type { RideStore } from '../store/rideStore'

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>

function mapStoreError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.includes('Ride is closed')) {
    return 'This ride has been closed by the organizer.'
  }

  return fallback
}

export function registerSocketHandlers(io: TypedServer, store: RideStore): void {
  io.on('connection', (socket) => {
    const memberships = new Map<string, { userId: string }>()

    const hasMembership = (rideId: string, userId: string): boolean => {
      const membership = memberships.get(rideId)
      return Boolean(membership && membership.userId === userId)
    }

    socket.on('ride:join', async (payload) => {
      try {
        const parsed = joinRidePayloadSchema.safeParse(payload)

        if (!parsed.success) {
          socket.emit('ride:error', { message: 'Invalid join payload.' })
          return
        }

        const data = parsed.data
        const hasAccess = await store.validateInviteToken(data.rideId, data.inviteToken)

        if (!hasAccess) {
          socket.emit('ride:error', { message: 'Invite code is invalid for this ride.' })
          return
        }

        socket.join(data.rideId)
        memberships.set(data.rideId, { userId: data.userId })

        const snapshot = await store.joinRide(data)
        io.to(data.rideId).emit('ride:member-joined', {
          userId: data.userId,
          displayName: data.displayName,
          role: data.role,
        })
        io.to(data.rideId).emit('ride:snapshot', snapshot)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('ride:join failed', error)
        socket.emit('ride:error', { message: mapStoreError(error, 'Could not join this ride.') })
      }
    })

    socket.on('ride:leave', async (payload) => {
      try {
        const parsed = leaveRidePayloadSchema.safeParse(payload)

        if (!parsed.success) {
          socket.emit('ride:error', { message: 'Invalid leave payload.' })
          return
        }

        const data = parsed.data
        if (!hasMembership(data.rideId, data.userId)) {
          return
        }

        memberships.delete(data.rideId)
        socket.leave(data.rideId)

        const snapshot = await store.leaveRide(data)
        io.to(data.rideId).emit('ride:member-left', data)
        io.to(data.rideId).emit('ride:snapshot', snapshot)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('ride:leave failed', error)
        socket.emit('ride:error', { message: 'Could not leave this ride.' })
      }
    })

    socket.on('ride:close', async (payload) => {
      try {
        const parsed = rideClosePayloadSchema.safeParse(payload)

        if (!parsed.success) {
          socket.emit('ride:error', { message: 'Invalid close payload.' })
          return
        }

        const data = parsed.data
        if (!hasMembership(data.rideId, data.userId)) {
          socket.emit('ride:error', { message: 'You are not connected to this ride.' })
          return
        }

        const hasOrganizerAccess = await store.validateOrganizerToken(data.rideId, data.organizerToken)

        if (!hasOrganizerAccess) {
          socket.emit('ride:error', { message: 'Only the organizer can close this ride.' })
          return
        }

        const snapshot = await store.closeRide(data.rideId)
        io.to(data.rideId).emit('ride:closed', {
          rideId: data.rideId,
          closedAt: snapshot.closedAt ?? Date.now(),
        })
        io.to(data.rideId).emit('ride:snapshot', snapshot)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('ride:close failed', error)
        socket.emit('ride:error', { message: mapStoreError(error, 'Could not close this ride.') })
      }
    })

    socket.on('telemetry:update', async (payload) => {
      try {
        const parsed = telemetryUpdatePayloadSchema.safeParse(payload)

        if (!parsed.success) {
          socket.emit('ride:error', { message: 'Invalid telemetry payload.' })
          return
        }

        const data = parsed.data
        if (!hasMembership(data.rideId, data.userId)) {
          socket.emit('ride:error', { message: 'You are not connected to this ride.' })
          return
        }

        await store.updateTelemetry(data)
        io.to(data.rideId).emit('telemetry:updated', data)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('telemetry:update failed', error)
        socket.emit('ride:error', {
          message: mapStoreError(error, 'Could not process telemetry update.'),
        })
      }
    })

    socket.on('waypoint:add', async (payload) => {
      try {
        const parsed = waypointAddPayloadSchema.safeParse(payload)

        if (!parsed.success) {
          socket.emit('ride:error', { message: 'Invalid waypoint payload.' })
          return
        }

        const data = parsed.data
        if (!hasMembership(data.rideId, data.userId)) {
          socket.emit('ride:error', { message: 'You are not connected to this ride.' })
          return
        }

        const waypoint = await store.addWaypoint(data)
        const snapshot = await store.getSnapshot(data.rideId)
        io.to(data.rideId).emit('waypoint:added', waypoint)
        io.to(data.rideId).emit('ride:snapshot', snapshot)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('waypoint:add failed', error)
        socket.emit('ride:error', { message: mapStoreError(error, 'Could not add waypoint.') })
      }
    })

    socket.on('waypoint:remove', async (payload) => {
      try {
        const parsed = waypointRemovePayloadSchema.safeParse(payload)

        if (!parsed.success) {
          socket.emit('ride:error', { message: 'Invalid waypoint removal payload.' })
          return
        }

        const data = parsed.data
        if (!hasMembership(data.rideId, data.userId)) {
          socket.emit('ride:error', { message: 'You are not connected to this ride.' })
          return
        }

        const snapshot = await store.removeWaypoint(data)
        io.to(data.rideId).emit('waypoint:removed', data)
        io.to(data.rideId).emit('ride:snapshot', snapshot)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('waypoint:remove failed', error)
        socket.emit('ride:error', { message: mapStoreError(error, 'Could not remove waypoint.') })
      }
    })

    socket.on('disconnect', () => {
      void (async () => {
        for (const [rideId, membership] of memberships.entries()) {
          try {
            const payload = { rideId, userId: membership.userId }
            const snapshot = await store.leaveRide(payload)
            io.to(rideId).emit('ride:member-left', payload)
            io.to(rideId).emit('ride:snapshot', snapshot)
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('disconnect cleanup failed', error)
          }
        }

        memberships.clear()
      })()
    })
  })
}
