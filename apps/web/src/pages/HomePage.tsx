import { useState } from 'react'

import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'

import { API_BASE_URL } from '../config'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { setDisplayName } from '../store/slices/sessionSlice'
import {
  loadRideInviteToken,
  saveRideInviteToken,
  saveRideOrganizerToken,
} from '../utils/id'

type CreateRideResponse = {
  rideId: string
  inviteToken: string
  organizerToken: string
}

function parseRideInput(input: string): { rideId: string; inviteToken: string } {
  const trimmed = input.trim()

  if (!trimmed) {
    return { rideId: '', inviteToken: '' }
  }

  try {
    const url = new URL(trimmed)
    const pathMatch = url.pathname.match(/^\/ride\/([^/]+)$/)

    if (pathMatch) {
      return {
        rideId: decodeURIComponent(pathMatch[1]),
        inviteToken: url.searchParams.get('invite')?.trim() ?? '',
      }
    }
  } catch {
    // Treat as plain ride code when not a URL.
  }

  return { rideId: trimmed, inviteToken: '' }
}

export function HomePage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const currentName = useAppSelector((state) => state.session.displayName)

  const [displayNameInput, setDisplayNameInput] = useState(currentName)
  const [joinRideIdInput, setJoinRideIdInput] = useState('')
  const [joinInviteTokenInput, setJoinInviteTokenInput] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const lockDisplayName = (): string | null => {
    const trimmedName = displayNameInput.trim()

    if (trimmedName.length < 2) {
      setError('Enter at least 2 characters for display name.')
      return null
    }

    dispatch(setDisplayName(trimmedName))
    return trimmedName
  }

  const handleCreateRide = async () => {
    const lockedName = lockDisplayName()

    if (!lockedName) {
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/rides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`)
      }

      const payload = (await response.json()) as CreateRideResponse
      saveRideInviteToken(payload.rideId, payload.inviteToken)
      saveRideOrganizerToken(payload.rideId, payload.organizerToken)
      navigate(
        `/ride/${payload.rideId}?role=organizer&invite=${encodeURIComponent(payload.inviteToken)}&host=${encodeURIComponent(payload.organizerToken)}`,
      )
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Could not create ride.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinRide = () => {
    const lockedName = lockDisplayName()

    if (!lockedName) {
      return
    }

    const parsedTarget = parseRideInput(joinRideIdInput)
    const rideId = parsedTarget.rideId

    if (rideId.length < 4) {
      setError('Enter a valid ride code to join.')
      return
    }

    const inviteToken =
      joinInviteTokenInput.trim() || parsedTarget.inviteToken || loadRideInviteToken(rideId)

    if (inviteToken.length < 10) {
      setError('Enter a valid invite code or paste the full invite link.')
      return
    }

    saveRideInviteToken(rideId, inviteToken)

    navigate(`/ride/${rideId}?role=rider&invite=${encodeURIComponent(inviteToken)}`)
  }

  return (
    <main className="home-page">
      <header className="hero-card">
        <p className="eyebrow">RideSync</p>
        <h1>Real-Time Motorcycle Group Coordinator</h1>
        <p>
          Create rides, invite your crew, and track everyone live with battery-aware telemetry tuned
          for mobile sessions.
        </p>
      </header>

      <section className="panel">
        <h2>Profile</h2>
        <label htmlFor="display-name">Display Name</label>
        <input
          id="display-name"
          value={displayNameInput}
          onChange={(event) => setDisplayNameInput(event.target.value)}
          placeholder="Ghost Rider"
          maxLength={40}
        />
      </section>

      <section className="panel action-grid">
        <div>
          <h2>Host A Ride</h2>
          <p>Generate a private ride code and start coordinating in seconds.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateRide}
            disabled={isLoading}
          >
            {isLoading ? 'Creating...' : 'Create Ride'}
          </button>
        </div>

        <div>
          <h2>Join A Ride</h2>
          <p>Paste an invite link, or enter a ride code plus invite code.</p>
          <label htmlFor="join-ride">Ride Code</label>
          <input
            id="join-ride"
            value={joinRideIdInput}
            onChange={(event) => setJoinRideIdInput(event.target.value)}
            placeholder="ride-94f1ab23 or full invite link"
          />
          <label htmlFor="join-invite">Invite Code</label>
          <input
            id="join-invite"
            value={joinInviteTokenInput}
            onChange={(event) => setJoinInviteTokenInput(event.target.value)}
            placeholder="inv_xxxxxxxxx"
          />
          <button type="button" className="btn btn-secondary" onClick={handleJoinRide}>
            Join Ride
          </button>
        </div>
      </section>

      {error && <p className="banner-error">{error}</p>}

      <footer className="legal-links">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Use</Link>
        <Link to="/delete-account">Delete My Data</Link>
      </footer>
    </main>
  )
}
