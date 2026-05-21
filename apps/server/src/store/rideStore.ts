import type {
  JoinRidePayload,
  LeaveRidePayload,
  RideSnapshotPayload,
  TelemetryUpdatePayload,
  Waypoint,
  WaypointAddPayload,
  WaypointRemovePayload,
} from '@ridesync/shared'

export type RideCreationResult = {
  snapshot: RideSnapshotPayload
  inviteToken: string
  organizerToken: string
}

export interface RideStore {
  listRideIds(): Promise<string[]>
  createRide(rideId: string): Promise<RideCreationResult>
  validateInviteToken(rideId: string, inviteToken: string): Promise<boolean>
  validateOrganizerToken(rideId: string, organizerToken: string): Promise<boolean>
  rotateInviteToken(rideId: string): Promise<string>
  closeRide(rideId: string): Promise<RideSnapshotPayload>
  joinRide(payload: JoinRidePayload): Promise<RideSnapshotPayload>
  leaveRide(payload: LeaveRidePayload): Promise<RideSnapshotPayload>
  updateTelemetry(payload: TelemetryUpdatePayload): Promise<RideSnapshotPayload>
  addWaypoint(payload: WaypointAddPayload): Promise<Waypoint>
  removeWaypoint(payload: WaypointRemovePayload): Promise<RideSnapshotPayload>
  getSnapshot(rideId: string): Promise<RideSnapshotPayload>
  close(): Promise<void>
}
