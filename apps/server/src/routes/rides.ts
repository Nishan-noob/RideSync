import { Router } from 'express'
import { z } from 'zod'

import type { RideStore } from '../store/rideStore'

const createRideSchema = z.object({
  rideId: z.string().min(4).max(32).optional(),
})

const snapshotQuerySchema = z.object({
  invite: z.string().min(10).max(128),
})

const organizerAuthSchema = z.object({
  organizerToken: z.string().min(10).max(128),
})

function makeRideId(): string {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `ride-${id}`
}

export function buildRideRouter(store: RideStore): Router {
  const router = Router()

  router.get('/rides', async (_req, res, next) => {
    try {
      const rides = await store.listRideIds()
      res.json({ rides })
    } catch (error) {
      next(error)
    }
  })

  router.post('/rides', async (req, res, next) => {
    try {
      const parsed = createRideSchema.safeParse(req.body)

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() })
      }

      const rideId = parsed.data.rideId ?? makeRideId()
      const created = await store.createRide(rideId)

      return res.status(201).json({
        rideId: created.snapshot.rideId,
        snapshot: created.snapshot,
        inviteToken: created.inviteToken,
        organizerToken: created.organizerToken,
      })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/rides/:rideId/snapshot', async (req, res, next) => {
    try {
      const rideId = req.params.rideId
      const parsedQuery = snapshotQuerySchema.safeParse(req.query)

      if (!parsedQuery.success) {
        return res.status(400).json({ error: 'Invite token is required.' })
      }

      const hasAccess = await store.validateInviteToken(rideId, parsedQuery.data.invite)

      if (!hasAccess) {
        return res.status(403).json({ error: 'Invalid invite token.' })
      }

      const snapshot = await store.getSnapshot(rideId)
      res.json(snapshot)
    } catch (error) {
      next(error)
    }
  })

  router.post('/rides/:rideId/invite/rotate', async (req, res, next) => {
    try {
      const rideId = req.params.rideId
      const parsedBody = organizerAuthSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return res.status(400).json({ error: 'Organizer token is required.' })
      }

      const hasAccess = await store.validateOrganizerToken(rideId, parsedBody.data.organizerToken)

      if (!hasAccess) {
        return res.status(403).json({ error: 'Invalid organizer token.' })
      }

      const snapshot = await store.getSnapshot(rideId)

      if (snapshot.status === 'closed') {
        return res.status(409).json({ error: 'Ride is closed and cannot rotate invite links.' })
      }

      const inviteToken = await store.rotateInviteToken(rideId)
      return res.json({ rideId, inviteToken })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/rides/:rideId/close', async (req, res, next) => {
    try {
      const rideId = req.params.rideId
      const parsedBody = organizerAuthSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return res.status(400).json({ error: 'Organizer token is required.' })
      }

      const hasAccess = await store.validateOrganizerToken(rideId, parsedBody.data.organizerToken)

      if (!hasAccess) {
        return res.status(403).json({ error: 'Invalid organizer token.' })
      }

      const snapshot = await store.closeRide(rideId)
      return res.json({ rideId, snapshot })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
