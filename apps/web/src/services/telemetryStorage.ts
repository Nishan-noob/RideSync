import localforage from 'localforage'

import type { QueuedTelemetry } from '../store/slices/telemetrySlice'

const telemetryDb = localforage.createInstance({
  name: 'ridesync',
  storeName: 'telemetry_queue',
})

const TELEMETRY_KEY = 'queue_v1'

export async function loadTelemetryQueue(): Promise<QueuedTelemetry[]> {
  const queue = await telemetryDb.getItem<QueuedTelemetry[]>(TELEMETRY_KEY)
  return Array.isArray(queue) ? queue : []
}

export async function saveTelemetryQueue(queue: QueuedTelemetry[]): Promise<void> {
  await telemetryDb.setItem(TELEMETRY_KEY, queue)
}

export async function clearTelemetryQueue(): Promise<void> {
  await telemetryDb.removeItem(TELEMETRY_KEY)
}
