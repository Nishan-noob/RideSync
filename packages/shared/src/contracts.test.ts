import { describe, expect, it } from 'vitest'

import { joinRidePayloadSchema } from './contracts'

describe('shared contracts', () => {
  it('validates a join ride payload', () => {
    const parsed = joinRidePayloadSchema.safeParse({
      rideId: 'ride-1234',
      inviteToken: 'inv_test_token_123',
      userId: 'rider-1',
      displayName: 'Nishan',
      role: 'rider',
    })

    expect(parsed.success).toBe(true)
  })
})
