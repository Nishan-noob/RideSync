import { z } from 'zod'

export const rideRoleSchema = z.enum(['organizer', 'rider'])
export const rideStatusSchema = z.enum(['active', 'closed'])

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).optional(),
  headingDeg: z.number().min(0).max(360).optional(),
  speedKmh: z.number().min(0).optional(),
  recordedAt: z.number().int().positive(),
})

export const rideMemberSchema = z.object({
  userId: z.string().min(2).max(60),
  displayName: z.string().min(2).max(40),
  role: rideRoleSchema,
})

export const waypointSchema = z.object({
  id: z.string().min(8),
  rideId: z.string().min(4),
  title: z.string().min(2).max(80),
  note: z.string().max(160).optional(),
  position: coordinateSchema,
  createdBy: z.string().min(2).max(60),
  createdAt: z.number().int().positive(),
})

export const joinRidePayloadSchema = z.object({
  rideId: z.string().min(4),
  inviteToken: z.string().min(10).max(128),
  userId: z.string().min(2).max(60),
  displayName: z.string().min(2).max(40),
  role: rideRoleSchema.default('rider'),
})

export const leaveRidePayloadSchema = z.object({
  rideId: z.string().min(4),
  userId: z.string().min(2).max(60),
})

export const telemetryUpdatePayloadSchema = z.object({
  rideId: z.string().min(4),
  userId: z.string().min(2).max(60),
  position: coordinateSchema,
  batteryLevel: z.number().min(0).max(100).optional(),
})

export const waypointAddPayloadSchema = z.object({
  rideId: z.string().min(4),
  userId: z.string().min(2).max(60),
  title: z.string().min(2).max(80),
  note: z.string().max(160).optional(),
  position: coordinateSchema,
})

export const waypointRemovePayloadSchema = z.object({
  rideId: z.string().min(4),
  waypointId: z.string().min(8),
  userId: z.string().min(2).max(60),
})

export const rideClosePayloadSchema = z.object({
  rideId: z.string().min(4),
  userId: z.string().min(2).max(60),
  organizerToken: z.string().min(10).max(128),
})

export const rideSnapshotPayloadSchema = z.object({
  rideId: z.string().min(4),
  status: rideStatusSchema,
  closedAt: z.number().int().positive().nullable(),
  members: z.array(rideMemberSchema),
  latestLocations: z.record(z.string(), coordinateSchema),
  waypoints: z.array(waypointSchema),
  updatedAt: z.number().int().positive(),
})

export type Coordinate = z.infer<typeof coordinateSchema>
export type RideRole = z.infer<typeof rideRoleSchema>
export type RideStatus = z.infer<typeof rideStatusSchema>
export type RideMember = z.infer<typeof rideMemberSchema>
export type Waypoint = z.infer<typeof waypointSchema>
export type JoinRidePayload = z.infer<typeof joinRidePayloadSchema>
export type LeaveRidePayload = z.infer<typeof leaveRidePayloadSchema>
export type TelemetryUpdatePayload = z.infer<typeof telemetryUpdatePayloadSchema>
export type WaypointAddPayload = z.infer<typeof waypointAddPayloadSchema>
export type WaypointRemovePayload = z.infer<typeof waypointRemovePayloadSchema>
export type RideClosePayload = z.infer<typeof rideClosePayloadSchema>
export type RideSnapshotPayload = z.infer<typeof rideSnapshotPayloadSchema>

export interface ServerToClientEvents {
  'ride:snapshot': (payload: RideSnapshotPayload) => void
  'ride:member-joined': (payload: RideMember) => void
  'ride:member-left': (payload: LeaveRidePayload) => void
  'telemetry:updated': (payload: TelemetryUpdatePayload) => void
  'waypoint:added': (payload: Waypoint) => void
  'waypoint:removed': (payload: WaypointRemovePayload) => void
  'ride:closed': (payload: { rideId: string; closedAt: number }) => void
  'ride:error': (payload: { message: string }) => void
}

export interface ClientToServerEvents {
  'ride:join': (payload: JoinRidePayload) => void
  'ride:leave': (payload: LeaveRidePayload) => void
  'ride:close': (payload: RideClosePayload) => void
  'telemetry:update': (payload: TelemetryUpdatePayload) => void
  'waypoint:add': (payload: WaypointAddPayload) => void
  'waypoint:remove': (payload: WaypointRemovePayload) => void
}
