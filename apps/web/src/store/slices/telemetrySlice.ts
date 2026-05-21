import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { TelemetryUpdatePayload } from '@ridesync/shared'

import { createClientId } from '../../utils/id'

const MAX_QUEUE_ITEMS = 500

export type QueuedTelemetry = TelemetryUpdatePayload & {
  clientId: string
  sent: boolean
}

type TelemetryState = {
  queue: QueuedTelemetry[]
}

const initialState: TelemetryState = {
  queue: [],
}

function trimQueue(queue: QueuedTelemetry[]): QueuedTelemetry[] {
  if (queue.length <= MAX_QUEUE_ITEMS) {
    return queue
  }

  const overshoot = queue.length - MAX_QUEUE_ITEMS
  const removableSentIds = queue.filter((item) => item.sent).slice(0, overshoot).map((item) => item.clientId)

  if (removableSentIds.length === 0) {
    return queue.slice(-MAX_QUEUE_ITEMS)
  }

  const removableSet = new Set(removableSentIds)
  return queue.filter((item) => !removableSet.has(item.clientId))
}

const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState,
  reducers: {
    hydrateTelemetryQueue(state, action: PayloadAction<QueuedTelemetry[]>) {
      state.queue = trimQueue(action.payload)
    },
    enqueueTelemetry: {
      prepare(payload: TelemetryUpdatePayload) {
        return {
          payload: {
            ...payload,
            clientId: createClientId('telemetry'),
            sent: false,
          } satisfies QueuedTelemetry,
        }
      },
      reducer(state, action: PayloadAction<QueuedTelemetry>) {
        state.queue = trimQueue([...state.queue, action.payload])
      },
    },
    markTelemetrySent(state, action: PayloadAction<string[]>) {
      const sentIds = new Set(action.payload)
      state.queue = state.queue.map((item) =>
        sentIds.has(item.clientId)
          ? {
              ...item,
              sent: true,
            }
          : item,
      )
    },
    clearSentTelemetry(state) {
      state.queue = state.queue.filter((item) => !item.sent)
    },
  },
})

export const {
  hydrateTelemetryQueue,
  enqueueTelemetry,
  markTelemetrySent,
  clearSentTelemetry,
} = telemetrySlice.actions

export default telemetrySlice.reducer
