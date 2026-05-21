import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { buildApp } from './app'
import { InMemoryRideStore } from './store/inMemoryRideStore'

describe('buildApp', () => {
  it('returns health payload', async () => {
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

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.service).toBe('ridesync-server')
  })
})
