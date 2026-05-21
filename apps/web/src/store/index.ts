import { configureStore } from '@reduxjs/toolkit'

import { loadTelemetryQueue, saveTelemetryQueue } from '../services/telemetryStorage'
import rideReducer from './slices/rideSlice'
import sessionReducer from './slices/sessionSlice'
import telemetryReducer, { hydrateTelemetryQueue } from './slices/telemetrySlice'

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    ride: rideReducer,
    telemetry: telemetryReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

let persistenceInitialized = false

export async function bootstrapStorePersistence(): Promise<void> {
  if (persistenceInitialized) {
    return
  }

  persistenceInitialized = true

  const queue = await loadTelemetryQueue()
  store.dispatch(hydrateTelemetryQueue(queue))

  let previousQueue = store.getState().telemetry.queue

  store.subscribe(() => {
    const nextQueue = store.getState().telemetry.queue

    if (nextQueue !== previousQueue) {
      previousQueue = nextQueue
      void saveTelemetryQueue(nextQueue)
    }
  })
}
