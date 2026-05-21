import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import type { Server } from 'socket.io'

import type { ClientToServerEvents, ServerToClientEvents } from '@ridesync/shared'

import type { AppEnv } from '../config'

type SocketServer = Server<ClientToServerEvents, ServerToClientEvents>

type SocketAdapterHandle = {
  close: () => Promise<void>
}

type ClosableRedisClient = {
  isOpen: boolean
  isReady: boolean
  quit: () => Promise<unknown>
  disconnect: () => void
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined

  try {
    return await new Promise<T>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, timeoutMs)

      promise.then(resolve, reject)
    })
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

async function closeRedisClient(client: ClosableRedisClient): Promise<void> {
  try {
    if (client.isReady) {
      await withTimeout(client.quit().then(() => undefined), 2000, 'Redis quit timed out')
    }
  } catch {
    // Swallow close errors and force disconnect in finally.
  } finally {
    if (client.isOpen) {
      client.disconnect()
    }
  }
}

export async function setupSocketAdapter(io: SocketServer, env: AppEnv): Promise<SocketAdapterHandle> {
  if (env.SOCKET_ADAPTER !== 'redis') {
    // eslint-disable-next-line no-console
    console.log('Socket adapter: memory')
    return {
      close: async () => {},
    }
  }

  const pubClient = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: 5000,
    },
  })
  const subClient = pubClient.duplicate()

  try {
    await withTimeout(
      Promise.all([pubClient.connect(), subClient.connect()]),
      5000,
      'Redis connection timed out',
    )
    io.adapter(createAdapter(pubClient, subClient))

    // eslint-disable-next-line no-console
    console.log('Socket adapter: redis')

    return {
      close: async () => {
        await Promise.allSettled([closeRedisClient(pubClient), closeRedisClient(subClient)])
      },
    }
  } catch (error) {
    await Promise.allSettled([closeRedisClient(pubClient), closeRedisClient(subClient)])

    if (env.NODE_ENV === 'production') {
      throw error
    }

    // eslint-disable-next-line no-console
    console.warn(
      `Could not connect to Redis (${toErrorMessage(error)}). Falling back to in-memory socket adapter.`,
    )
    // eslint-disable-next-line no-console
    console.log('Socket adapter: memory')

    return {
      close: async () => {},
    }
  }
}
