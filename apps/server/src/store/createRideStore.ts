import type { AppEnv } from '../config'

import { InMemoryRideStore } from './inMemoryRideStore'
import { MongoRideStore } from './mongoRideStore'
import type { RideStore } from './rideStore'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function createRideStore(env: AppEnv): Promise<RideStore> {
  if (env.STORE_DRIVER !== 'mongo') {
    // eslint-disable-next-line no-console
    console.log('Ride store driver: memory')
    return new InMemoryRideStore()
  }

  try {
    const store = await MongoRideStore.connect(env.MONGODB_URI, env.MONGODB_DB)
    // eslint-disable-next-line no-console
    console.log('Ride store driver: mongo')
    return store
  } catch (error) {
    if (env.NODE_ENV === 'production') {
      throw error
    }

    // eslint-disable-next-line no-console
    console.warn(
      `Could not connect to MongoDB (${toErrorMessage(error)}). Falling back to in-memory store.`,
    )
    // eslint-disable-next-line no-console
    console.log('Ride store driver: memory')
    return new InMemoryRideStore()
  }
}
