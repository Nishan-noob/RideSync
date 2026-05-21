const DEVICE_USER_ID_KEY = 'ridesync-device-user-id'
const DISPLAY_NAME_KEY = 'ridesync-display-name'
const INVITE_TOKEN_PREFIX = 'ridesync-invite-token:'
const ORGANIZER_TOKEN_PREFIX = 'ridesync-organizer-token:'

function makeEntropySegment(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  }

  const timePart = Date.now().toString(36)
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `${timePart}${randomPart}`.slice(0, 10)
}

export function createClientId(prefix: string): string {
  return `${prefix}-${makeEntropySegment()}`
}

export function getOrCreateDeviceUserId(): string {
  const existing = localStorage.getItem(DEVICE_USER_ID_KEY)

  if (existing) {
    return existing
  }

  const id = createClientId('rider')
  localStorage.setItem(DEVICE_USER_ID_KEY, id)
  return id
}

export function saveDisplayName(name: string): void {
  localStorage.setItem(DISPLAY_NAME_KEY, name)
}

export function loadDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) ?? ''
}

function inviteTokenKey(rideId: string): string {
  return `${INVITE_TOKEN_PREFIX}${rideId}`
}

function organizerTokenKey(rideId: string): string {
  return `${ORGANIZER_TOKEN_PREFIX}${rideId}`
}

export function saveRideInviteToken(rideId: string, inviteToken: string): void {
  localStorage.setItem(inviteTokenKey(rideId), inviteToken)
}

export function loadRideInviteToken(rideId: string): string {
  return localStorage.getItem(inviteTokenKey(rideId)) ?? ''
}

export function saveRideOrganizerToken(rideId: string, organizerToken: string): void {
  localStorage.setItem(organizerTokenKey(rideId), organizerToken)
}

export function loadRideOrganizerToken(rideId: string): string {
  return localStorage.getItem(organizerTokenKey(rideId)) ?? ''
}

export function clearAllLocalIdentityData(): void {
  const keys = Object.keys(localStorage)

  for (const key of keys) {
    if (
      key === DEVICE_USER_ID_KEY ||
      key === DISPLAY_NAME_KEY ||
      key.startsWith(INVITE_TOKEN_PREFIX) ||
      key.startsWith(ORGANIZER_TOKEN_PREFIX)
    ) {
      localStorage.removeItem(key)
    }
  }
}
