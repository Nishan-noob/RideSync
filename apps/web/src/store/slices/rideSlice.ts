import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type {
  LeaveRidePayload,
  RideMember,
  RideStatus,
  RideSnapshotPayload,
  TelemetryUpdatePayload,
  Waypoint,
  WaypointRemovePayload,
} from '@ridesync/shared'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

type RideState = {
  rideId: string
  status: RideStatus
  closedAt: number | null
  connectionStatus: ConnectionStatus
  members: RideMember[]
  latestLocations: RideSnapshotPayload['latestLocations']
  waypoints: Waypoint[]
  lastError: string | null
}

const initialState: RideState = {
  rideId: '',
  status: 'active',
  closedAt: null,
  connectionStatus: 'idle',
  members: [],
  latestLocations: {},
  waypoints: [],
  lastError: null,
}

const rideSlice = createSlice({
  name: 'ride',
  initialState,
  reducers: {
    setRideContext(state, action: PayloadAction<string>) {
      state.rideId = action.payload
    },
    setConnectionStatus(state, action: PayloadAction<ConnectionStatus>) {
      state.connectionStatus = action.payload
      if (action.payload !== 'error') {
        state.lastError = null
      }
    },
    setRideError(state, action: PayloadAction<string>) {
      state.lastError = action.payload
    },
    clearRideError(state) {
      state.lastError = null
    },
    replaceSnapshot(state, action: PayloadAction<RideSnapshotPayload>) {
      state.rideId = action.payload.rideId
      state.status = action.payload.status
      state.closedAt = action.payload.closedAt
      state.members = action.payload.members
      state.latestLocations = action.payload.latestLocations
      state.waypoints = action.payload.waypoints
    },
    memberJoined(state, action: PayloadAction<RideMember>) {
      const hasMember = state.members.some((member) => member.userId === action.payload.userId)
      if (!hasMember) {
        state.members.push(action.payload)
      }
    },
    memberLeft(state, action: PayloadAction<LeaveRidePayload>) {
      state.members = state.members.filter((member) => member.userId !== action.payload.userId)
      delete state.latestLocations[action.payload.userId]
    },
    telemetryUpdated(state, action: PayloadAction<TelemetryUpdatePayload>) {
      state.latestLocations[action.payload.userId] = action.payload.position
    },
    waypointAdded(state, action: PayloadAction<Waypoint>) {
      const hasWaypoint = state.waypoints.some((waypoint) => waypoint.id === action.payload.id)
      if (!hasWaypoint) {
        state.waypoints.push(action.payload)
      }
    },
    waypointRemoved(state, action: PayloadAction<WaypointRemovePayload>) {
      state.waypoints = state.waypoints.filter(
        (waypoint) => waypoint.id !== action.payload.waypointId,
      )
    },
    clearRideState(state) {
      state.members = []
      state.latestLocations = {}
      state.waypoints = []
      state.status = 'active'
      state.closedAt = null
      state.connectionStatus = 'idle'
      state.lastError = null
    },
  },
})

export const {
  setRideContext,
  setConnectionStatus,
  setRideError,
  clearRideError,
  replaceSnapshot,
  memberJoined,
  memberLeft,
  telemetryUpdated,
  waypointAdded,
  waypointRemoved,
  clearRideState,
} = rideSlice.actions

export default rideSlice.reducer
