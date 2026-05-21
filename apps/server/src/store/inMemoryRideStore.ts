import {
  type Coordinate,
  type JoinRidePayload,
  type LeaveRidePayload,
  type RideMember,
  type RideStatus,
  type RideSnapshotPayload,
  type TelemetryUpdatePayload,
  type Waypoint,
  type WaypointAddPayload,
  type WaypointRemovePayload,
} from '@ridesync/shared'
import { randomBytes } from 'node:crypto'

import type { RideCreationResult, RideStore } from './rideStore'

type RideState = {
  rideId: string
  inviteToken: string
  organizerToken: string
  status: RideStatus
  closedAt: number | null
  members: Map<string, RideMember>
  latestLocations: Map<string, Coordinate>
  waypoints: Map<string, Waypoint>
  updatedAt: number
}

function now(): number {
  return Date.now()
}

function makeInviteToken(): string {
  return randomBytes(18).toString('base64url')
}

function makeOrganizerToken(): string {
  return randomBytes(18).toString('base64url')
}

export class InMemoryRideStore implements RideStore {
  private readonly rides = new Map<string, RideState>()

  async listRideIds(): Promise<string[]> {
    return Array.from(this.rides.keys())
  }

  async createRide(rideId: string): Promise<RideCreationResult> {
    const state = this.ensureRide(rideId)
    state.updatedAt = now()
    return {
      snapshot: this.toSnapshot(state),
      inviteToken: state.inviteToken,
      organizerToken: state.organizerToken,
    }
  }

  async validateInviteToken(rideId: string, inviteToken: string): Promise<boolean> {
    const state = this.ensureRide(rideId)
    return state.inviteToken === inviteToken
  }

  async validateOrganizerToken(rideId: string, organizerToken: string): Promise<boolean> {
    const state = this.ensureRide(rideId)
    return state.organizerToken === organizerToken
  }

  async rotateInviteToken(rideId: string): Promise<string> {
    const state = this.ensureRide(rideId)
    state.inviteToken = makeInviteToken()
    state.updatedAt = now()
    return state.inviteToken
  }

  async closeRide(rideId: string): Promise<RideSnapshotPayload> {
    const state = this.ensureRide(rideId)
    state.status = 'closed'
    state.closedAt = now()
    state.members.clear()
    state.latestLocations.clear()
    state.updatedAt = state.closedAt

    return this.toSnapshot(state)
  }

  async joinRide(payload: JoinRidePayload): Promise<RideSnapshotPayload> {
    const state = this.ensureRide(payload.rideId)
    this.assertRideActive(state)

    const member: RideMember = {
      userId: payload.userId,
      displayName: payload.displayName,
      role: payload.role,
    }

    state.members.set(payload.userId, member)
    state.updatedAt = now()

    return this.toSnapshot(state)
  }

  async leaveRide(payload: LeaveRidePayload): Promise<RideSnapshotPayload> {
    const state = this.ensureRide(payload.rideId)
    state.members.delete(payload.userId)
    state.latestLocations.delete(payload.userId)
    state.updatedAt = now()

    return this.toSnapshot(state)
  }

  async updateTelemetry(payload: TelemetryUpdatePayload): Promise<RideSnapshotPayload> {
    const state = this.ensureRide(payload.rideId)
    this.assertRideActive(state)

    state.latestLocations.set(payload.userId, payload.position)
    state.updatedAt = now()

    return this.toSnapshot(state)
  }

  async addWaypoint(payload: WaypointAddPayload): Promise<Waypoint> {
    const state = this.ensureRide(payload.rideId)
    this.assertRideActive(state)

    const waypoint: Waypoint = {
      id: crypto.randomUUID(),
      rideId: payload.rideId,
      title: payload.title,
      note: payload.note,
      position: payload.position,
      createdBy: payload.userId,
      createdAt: now(),
    }

    state.waypoints.set(waypoint.id, waypoint)
    state.updatedAt = now()

    return waypoint
  }

  async removeWaypoint(payload: WaypointRemovePayload): Promise<RideSnapshotPayload> {
    const state = this.ensureRide(payload.rideId)
    this.assertRideActive(state)

    state.waypoints.delete(payload.waypointId)
    state.updatedAt = now()

    return this.toSnapshot(state)
  }

  async getSnapshot(rideId: string): Promise<RideSnapshotPayload> {
    return this.toSnapshot(this.ensureRide(rideId))
  }

  async close(): Promise<void> {
    return Promise.resolve()
  }

  private ensureRide(rideId: string): RideState {
    const state = this.rides.get(rideId)

    if (state) {
      return state
    }

    const newState: RideState = {
      rideId,
      inviteToken: makeInviteToken(),
      organizerToken: makeOrganizerToken(),
      status: 'active',
      closedAt: null,
      members: new Map(),
      latestLocations: new Map(),
      waypoints: new Map(),
      updatedAt: now(),
    }

    this.rides.set(rideId, newState)
    return newState
  }

  private toSnapshot(state: RideState): RideSnapshotPayload {
    return {
      rideId: state.rideId,
      status: state.status,
      closedAt: state.closedAt,
      members: Array.from(state.members.values()),
      latestLocations: Object.fromEntries(state.latestLocations.entries()),
      waypoints: Array.from(state.waypoints.values()).sort((a, b) => a.createdAt - b.createdAt),
      updatedAt: state.updatedAt,
    }
  }

  private assertRideActive(state: RideState): void {
    if (state.status === 'closed') {
      throw new Error('Ride is closed.')
    }
  }
}
