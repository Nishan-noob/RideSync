import 'dotenv/config'

import http from 'node:http'

import { Server } from 'socket.io'

import type { ClientToServerEvents, ServerToClientEvents } from '@ridesync/shared'

import { buildApp } from './app'
import { isOriginAllowed, loadEnv } from './config'
import { registerSocketHandlers } from './socket/registerSocketHandlers'
import { setupSocketAdapter } from './socket/setupSocketAdapter'
import { createRideStore } from './store/createRideStore'

const env = loadEnv()
const rideStore = await createRideStore(env)

const app = buildApp(env, rideStore)
const server = http.createServer(app)

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin, env))
    },
  },
})

const socketAdapter = await setupSocketAdapter(io, env)

registerSocketHandlers(io, rideStore)

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`RideSync server listening on http://localhost:${env.PORT}`)
})

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Shutting down RideSync server...`)

  void (async () => {
    io.close()

    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })

    await Promise.all([rideStore.close(), socketAdapter.close()])
    process.exit(0)
  })()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
