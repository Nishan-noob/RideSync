import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import { isOriginAllowed, type AppEnv } from './config'
import { healthRouter } from './routes/health'
import { buildRideRouter } from './routes/rides'
import type { RideStore } from './store/rideStore'

export function buildApp(env: AppEnv, store: RideStore) {
  const app = express()

  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isOriginAllowed(origin, env))
      },
      credentials: true,
    }),
  )
  app.use(helmet())
  app.use(express.json({ limit: '256kb' }))

  app.use('/api', healthRouter)
  app.use('/api', buildRideRouter(store))

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error)
      return
    }

    // eslint-disable-next-line no-console
    console.error('Unhandled API error', error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
