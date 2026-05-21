import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { buildApp } from '../app'
import { InMemoryRideStore } from '../store/inMemoryRideStore'

describe('ride routes access control', () => {
  it('returns invite token on create and enforces it for snapshot reads', async () => {
    const app = buildApp(
      {
        PORT: 8080,
        CLIENT_ORIGIN: 'http://localhost:5173',
        NODE_ENV: 'test',
        STORE_DRIVER: 'memory',
        MONGODB_URI: 'mongodb://127.0.0.1:27017',
        MONGODB_DB: 'ridesync-test',
        SOCKET_ADAPTER: 'memory',
        REDIS_URL: 'redis://127.0.0.1:6379',
      },
      new InMemoryRideStore(),
    )

    const createResponse = await request(app)
      .post('/api/rides')
      .send({ rideId: 'ride-test-invite' })
      .expect(201)

    const payload = createResponse.body as {
      rideId: string
      inviteToken: string
      organizerToken: string
      snapshot: { rideId: string; status: string }
    }

    expect(payload.rideId).toBe('ride-test-invite')
    expect(payload.snapshot.rideId).toBe('ride-test-invite')
    expect(payload.snapshot.status).toBe('active')
    expect(typeof payload.inviteToken).toBe('string')
    expect(payload.inviteToken.length).toBeGreaterThanOrEqual(10)
    expect(typeof payload.organizerToken).toBe('string')
    expect(payload.organizerToken.length).toBeGreaterThanOrEqual(10)

    await request(app).get('/api/rides/ride-test-invite/snapshot').expect(400)

    await request(app)
      .get('/api/rides/ride-test-invite/snapshot?invite=invalid-token')
      .expect(403)

    const snapshotResponse = await request(app)
      .get(`/api/rides/ride-test-invite/snapshot?invite=${encodeURIComponent(payload.inviteToken)}`)
      .expect(200)

    expect(snapshotResponse.body.rideId).toBe('ride-test-invite')

    await request(app)
      .post('/api/rides/ride-test-invite/invite/rotate')
      .send({ organizerToken: 'wrong-token' })
      .expect(403)

    const rotateResponse = await request(app)
      .post('/api/rides/ride-test-invite/invite/rotate')
      .send({ organizerToken: payload.organizerToken })
      .expect(200)

    const rotatedInvite = (rotateResponse.body as { inviteToken: string }).inviteToken
    expect(typeof rotatedInvite).toBe('string')
    expect(rotatedInvite).not.toBe(payload.inviteToken)

    await request(app)
      .get(`/api/rides/ride-test-invite/snapshot?invite=${encodeURIComponent(payload.inviteToken)}`)
      .expect(403)

    await request(app)
      .get(`/api/rides/ride-test-invite/snapshot?invite=${encodeURIComponent(rotatedInvite)}`)
      .expect(200)

    await request(app)
      .post('/api/rides/ride-test-invite/close')
      .send({ organizerToken: 'wrong-token' })
      .expect(403)

    const closeResponse = await request(app)
      .post('/api/rides/ride-test-invite/close')
      .send({ organizerToken: payload.organizerToken })
      .expect(200)

    const closedSnapshot = (closeResponse.body as { snapshot: { status: string; closedAt: number | null } })
      .snapshot
    expect(closedSnapshot.status).toBe('closed')
    expect(typeof closedSnapshot.closedAt).toBe('number')
  })
})
