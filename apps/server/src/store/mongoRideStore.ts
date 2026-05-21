import { randomBytes, randomUUID } from 'node:crypto'

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
import { MongoClient, type Collection } from 'mongodb'

import type { RideCreationResult, RideStore } from './rideStore'

type RideDocument = {
  _id: string
  inviteToken: string
  organizerToken: string
  status: RideStatus
  closedAt: number | null
  members: RideMember[]
  latestLocations: Record<string, Coordinate>
  waypoints: Waypoint[]
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

export class MongoRideStore implements RideStore {
  private constructor(
    private readonly client: MongoClient,
    private readonly rides: Collection<RideDocument>,
  ) {}

  static async connect(uri: string, databaseName: string): Promise<MongoRideStore> {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
    await client.connect()

    const database = client.db(databaseName)
    const rides = database.collection<RideDocument>('rides')

    await rides.createIndex({ updatedAt: -1 })

    return new MongoRideStore(client, rides)
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  async listRideIds(): Promise<string[]> {
    const rides = await this.rides.find({}, { projection: { _id: 1 } }).toArray()
    return rides.map((entry) => entry._id)
  }

  async createRide(rideId: string): Promise<RideCreationResult> {
    const ride = await this.ensureRide(rideId)
    ride.updatedAt = now()
    await this.persistRide(ride)
    return {
      snapshot: this.toSnapshot(ride),
      inviteToken: ride.inviteToken,
      organizerToken: ride.organizerToken,
    }
  }

  async validateInviteToken(rideId: string, inviteToken: string): Promise<boolean> {
    const ride = await this.ensureRide(rideId)
    return ride.inviteToken === inviteToken
  }

  async validateOrganizerToken(rideId: string, organizerToken: string): Promise<boolean> {
    const ride = await this.ensureRide(rideId)
    return ride.organizerToken === organizerToken
  }

  async rotateInviteToken(rideId: string): Promise<string> {
    const ride = await this.ensureRide(rideId)
    this.assertRideActive(ride)

    ride.inviteToken = makeInviteToken()
    ride.updatedAt = now()
    await this.persistRide(ride)
    return ride.inviteToken
  }

  async closeRide(rideId: string): Promise<RideSnapshotPayload> {
    const ride = await this.ensureRide(rideId)
    ride.status = 'closed'
    ride.closedAt = now()
    ride.members = []
    ride.latestLocations = {}
    ride.updatedAt = ride.closedAt

    await this.persistRide(ride)
    return this.toSnapshot(ride)
  }

  async joinRide(payload: JoinRidePayload): Promise<RideSnapshotPayload> {
    const ride = await this.ensureRide(payload.rideId)
    this.assertRideActive(ride)

    const member: RideMember = {
      userId: payload.userId,
      displayName: payload.displayName,
      role: payload.role,
    }

    ride.members = ride.members.filter((entry) => entry.userId !== payload.userId)
    ride.members.push(member)
    ride.updatedAt = now()

    await this.persistRide(ride)
    return this.toSnapshot(ride)
  }

  async leaveRide(payload: LeaveRidePayload): Promise<RideSnapshotPayload> {
    const ride = await this.ensureRide(payload.rideId)

    ride.members = ride.members.filter((entry) => entry.userId !== payload.userId)
    delete ride.latestLocations[payload.userId]
    ride.updatedAt = now()

    await this.persistRide(ride)
    return this.toSnapshot(ride)
  }

  async updateTelemetry(payload: TelemetryUpdatePayload): Promise<RideSnapshotPayload> {
    const ride = await this.ensureRide(payload.rideId)
    this.assertRideActive(ride)

    ride.latestLocations[payload.userId] = payload.position
    ride.updatedAt = now()

    await this.persistRide(ride)
    return this.toSnapshot(ride)
  }

  async addWaypoint(payload: WaypointAddPayload): Promise<Waypoint> {
    const ride = await this.ensureRide(payload.rideId)
    this.assertRideActive(ride)

    const waypoint: Waypoint = {
      id: randomUUID(),
      rideId: payload.rideId,
      title: payload.title,
      note: payload.note,
      position: payload.position,
      createdBy: payload.userId,
      createdAt: now(),
    }

    ride.waypoints.push(waypoint)
    ride.updatedAt = now()

    await this.persistRide(ride)
    return waypoint
  }

  async removeWaypoint(payload: WaypointRemovePayload): Promise<RideSnapshotPayload> {
    const ride = await this.ensureRide(payload.rideId)
    this.assertRideActive(ride)

    ride.waypoints = ride.waypoints.filter((waypoint) => waypoint.id !== payload.waypointId)
    ride.updatedAt = now()

    await this.persistRide(ride)
    return this.toSnapshot(ride)
  }

  async getSnapshot(rideId: string): Promise<RideSnapshotPayload> {
    const ride = await this.ensureRide(rideId)
    return this.toSnapshot(ride)
  }

  private async ensureRide(rideId: string): Promise<RideDocument> {
    const existing = await this.rides.findOne({ _id: rideId })

    if (existing) {
      const normalized = this.normalize(existing)

      if (!existing.inviteToken || !existing.organizerToken || !existing.status) {
        await this.persistRide(normalized)
      }

      return normalized
    }

    const created = this.createEmptyRide(rideId)

    await this.rides.updateOne(
      { _id: rideId },
      {
        $setOnInsert: created,
      },
      { upsert: true },
    )

    const latest = await this.rides.findOne({ _id: rideId })

    if (latest) {
      return this.normalize(latest)
    }

    return created
  }

  private async persistRide(ride: RideDocument): Promise<void> {
    await this.rides.updateOne(
      { _id: ride._id },
      {
        $set: {
          members: ride.members,
          latestLocations: ride.latestLocations,
          waypoints: ride.waypoints,
          inviteToken: ride.inviteToken,
          organizerToken: ride.organizerToken,
          status: ride.status,
          closedAt: ride.closedAt,
          updatedAt: ride.updatedAt,
        },
      },
      { upsert: true },
    )
  }

  private createEmptyRide(rideId: string): RideDocument {
    return {
      _id: rideId,
      inviteToken: makeInviteToken(),
      organizerToken: makeOrganizerToken(),
      status: 'active',
      closedAt: null,
      members: [],
      latestLocations: {},
      waypoints: [],
      updatedAt: now(),
    }
  }

  private normalize(ride: RideDocument): RideDocument {
    return {
      _id: ride._id,
      inviteToken: typeof ride.inviteToken === 'string' && ride.inviteToken ? ride.inviteToken : makeInviteToken(),
      organizerToken:
        typeof ride.organizerToken === 'string' && ride.organizerToken
          ? ride.organizerToken
          : makeOrganizerToken(),
      status: ride.status === 'closed' ? 'closed' : 'active',
      closedAt: typeof ride.closedAt === 'number' ? ride.closedAt : null,
      members: Array.isArray(ride.members) ? ride.members : [],
      latestLocations: ride.latestLocations ?? {},
      waypoints: Array.isArray(ride.waypoints) ? ride.waypoints : [],
      updatedAt: typeof ride.updatedAt === 'number' ? ride.updatedAt : now(),
    }
  }

  private toSnapshot(ride: RideDocument): RideSnapshotPayload {
    return {
      rideId: ride._id,
      status: ride.status,
      closedAt: ride.closedAt,
      members: ride.members,
      latestLocations: ride.latestLocations,
      waypoints: [...ride.waypoints].sort((a, b) => a.createdAt - b.createdAt),
      updatedAt: ride.updatedAt,
    }
  }

  private assertRideActive(ride: RideDocument): void {
    if (ride.status === 'closed') {
      throw new Error('Ride is closed.')
    }
  }
}
