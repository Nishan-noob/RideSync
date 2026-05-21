import { useEffect, useMemo, useState } from 'react'

import type { RideRole, RideSnapshotPayload } from '@ridesync/shared'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { MapCanvas } from '../components/MapCanvas'
import { API_BASE_URL, SOCKET_URL } from '../config'
import { useAdaptiveTelemetry } from '../hooks/useAdaptiveTelemetry'
import { useRideSocket } from '../hooks/useRideSocket'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import {
  clearRideState,
  replaceSnapshot,
  setRideContext,
  setRideError,
} from '../store/slices/rideSlice'
import {
  loadRideInviteToken,
  loadRideOrganizerToken,
  saveRideInviteToken,
  saveRideOrganizerToken,
} from '../utils/id'

function formatLastSeen(timestamp?: number): string {
  if (!timestamp) {
    return 'No signal yet'
  }

  const deltaMs = Date.now() - timestamp

  if (deltaMs < 10_000) {
    return 'just now'
  }

  if (deltaMs < 60_000) {
    return `${Math.round(deltaMs / 1_000)}s ago`
  }

  return `${Math.round(deltaMs / 60_000)}m ago`
}

function formatClosedAt(timestamp: number | null): string {
  if (!timestamp) {
    return 'unknown time'
  }

  return new Date(timestamp).toLocaleString()
}

function fallbackWaypointPosition() {
  return {
    lat: 12.9716,
    lng: 77.5946,
    accuracyM: 20,
    recordedAt: Date.now(),
  }
}

export function RidePage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { rideId = '' } = useParams()

  const session = useAppSelector((state) => state.session)
  const rideState = useAppSelector((state) => state.ride)
  const queue = useAppSelector((state) => state.telemetry.queue)

  const [isSharing, setIsSharing] = useState(true)
  const [waypointTitle, setWaypointTitle] = useState('')
  const [waypointNote, setWaypointNote] = useState('')
  const [isRotatingInvite, setIsRotatingInvite] = useState(false)
  const [isClosingRide, setIsClosingRide] = useState(false)

  const role: RideRole = searchParams.get('role') === 'organizer' ? 'organizer' : 'rider'
  const displayName = session.displayName || session.userId
  const inviteFromQuery = (searchParams.get('invite') ?? '').trim()
  const organizerFromQuery = (searchParams.get('host') ?? '').trim()
  const inviteToken = useMemo(() => {
    if (!rideId) {
      return ''
    }

    return inviteFromQuery || loadRideInviteToken(rideId)
  }, [inviteFromQuery, rideId])
  const organizerToken = useMemo(() => {
    if (!rideId) {
      return ''
    }

    return organizerFromQuery || loadRideOrganizerToken(rideId)
  }, [organizerFromQuery, rideId])

  useEffect(() => {
    if (!rideId) {
      return
    }

    dispatch(setRideContext(rideId))

    return () => {
      dispatch(clearRideState())
    }
  }, [dispatch, rideId])

  useEffect(() => {
    if (!rideId || !inviteFromQuery) {
      return
    }

    saveRideInviteToken(rideId, inviteFromQuery)
  }, [inviteFromQuery, rideId])

  useEffect(() => {
    if (!rideId || !organizerFromQuery) {
      return
    }

    saveRideOrganizerToken(rideId, organizerFromQuery)
  }, [organizerFromQuery, rideId])

  useEffect(() => {
    if (!rideId || !inviteToken) {
      if (rideId && !inviteToken) {
        dispatch(setRideError('Invite code missing. Use a full invite link to access this ride.'))
      }
      return
    }

    let ignore = false

    void fetch(
      `${API_BASE_URL}/api/rides/${rideId}/snapshot?invite=${encodeURIComponent(inviteToken)}`,
      {},
    )
      .then(async (response) => {
        if (ignore) {
          return
        }

        if (!response.ok) {
          throw new Error(`Snapshot request failed with ${response.status}`)
        }

        const payload = await response.json()
        dispatch(replaceSnapshot(payload))
      })
      .catch((error: unknown) => {
        if (ignore) {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to load ride snapshot.'
        dispatch(setRideError(message))
      })

    return () => {
      ignore = true
    }
  }, [dispatch, inviteToken, rideId])

  const socketRef = useRideSocket({
    rideId,
    inviteToken,
    userId: session.userId,
    displayName,
    role,
  })

  const isRideJoined = useMemo(() => {
    return rideState.members.some((member) => member.userId === session.userId)
  }, [rideState.members, session.userId])
  const isSharingActive = isSharing && rideState.status === 'active'

  useAdaptiveTelemetry({
    rideId,
    userId: session.userId,
    isSharing: isSharingActive,
    isRideJoined: isRideJoined && rideState.status === 'active',
    socketRef,
  })

  const pendingTelemetryCount = useMemo(() => {
    return queue.filter((item) => !item.sent).length
  }, [queue])

  const isDemoTelemetry = import.meta.env.DEV && !window.isSecureContext
  const isDebugMode = import.meta.env.DEV

  const selfLocation = rideState.latestLocations[session.userId]
  const isRideClosed = rideState.status === 'closed'
  const inviteLink = inviteToken
    ? `${window.location.origin}/ride/${rideId}?role=rider&invite=${encodeURIComponent(inviteToken)}`
    : ''

  const handleRotateInvite = async () => {
    if (role !== 'organizer') {
      return
    }

    if (!organizerToken) {
      dispatch(setRideError('Organizer token missing. Re-open this ride from organizer link.'))
      return
    }

    setIsRotatingInvite(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/rides/${rideId}/invite/rotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organizerToken }),
      })

      if (!response.ok) {
        throw new Error(`Rotate invite failed with ${response.status}`)
      }

      const payload = (await response.json()) as { inviteToken: string }
      saveRideInviteToken(rideId, payload.inviteToken)
      navigate(
        `/ride/${rideId}?role=${role}&invite=${encodeURIComponent(payload.inviteToken)}&host=${encodeURIComponent(organizerToken)}`,
        {
          replace: true,
        },
      )
      dispatch(setRideError('Invite link rotated. Old invite links no longer work.'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not rotate invite link.'
      dispatch(setRideError(message))
    } finally {
      setIsRotatingInvite(false)
    }
  }

  const handleCloseRide = async () => {
    if (role !== 'organizer') {
      return
    }

    if (!organizerToken) {
      dispatch(setRideError('Organizer token missing. Re-open this ride from organizer link.'))
      return
    }

    setIsClosingRide(true)

    try {
      const socket = socketRef.current

      if (socket && socket.connected) {
        socket.emit('ride:close', {
          rideId,
          userId: session.userId,
          organizerToken,
        })
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/${rideId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organizerToken }),
      })

      if (!response.ok) {
        throw new Error(`Close ride failed with ${response.status}`)
      }

      const payload = (await response.json()) as { snapshot: RideSnapshotPayload }
      dispatch(replaceSnapshot(payload.snapshot))
      dispatch(setRideError('Ride is now closed.'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not close ride.'
      dispatch(setRideError(message))
    } finally {
      setIsClosingRide(false)
    }
  }

  const handleAddWaypoint = () => {
    if (isRideClosed) {
      dispatch(setRideError('Ride is closed. Waypoints can no longer be changed.'))
      return
    }

    const title = waypointTitle.trim()

    if (!title) {
      dispatch(setRideError('Waypoint title is required.'))
      return
    }

    const socket = socketRef.current

    if (!socket || !socket.connected) {
      dispatch(setRideError('Socket is disconnected. Reconnect to add waypoint.'))
      return
    }

    socket.emit('waypoint:add', {
      rideId,
      userId: session.userId,
      title,
      note: waypointNote.trim() || undefined,
      position: selfLocation
        ? {
            ...selfLocation,
            recordedAt: Date.now(),
          }
        : fallbackWaypointPosition(),
    })

    if (!selfLocation) {
      dispatch(setRideError('No GPS lock yet. Waypoint was placed using demo position.'))
    }

    setWaypointTitle('')
    setWaypointNote('')
  }

  const handleRemoveWaypoint = (waypointId: string) => {
    if (isRideClosed) {
      return
    }

    const socket = socketRef.current

    if (!socket || !socket.connected) {
      return
    }

    socket.emit('waypoint:remove', {
      rideId,
      waypointId,
      userId: session.userId,
    })
  }

  const copyRideCode = async () => {
    if (!inviteLink) {
      dispatch(setRideError('Invite link is unavailable. Go back and re-open via invite link.'))
      return
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteLink)
        return
      }

      const textArea = document.createElement('textarea')
      textArea.value = inviteLink
      textArea.setAttribute('readonly', '')
      textArea.style.position = 'absolute'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.select()

      const copied = document.execCommand('copy')
      document.body.removeChild(textArea)

      if (!copied) {
        throw new Error('Clipboard command failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not copy code.'
      window.prompt('Copy this invite link manually:', inviteLink)
      dispatch(setRideError(`Could not copy invite link automatically: ${message}`))
    }
  }

  if (!rideId) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="ride-page">
      <header className="panel ride-header">
        <div>
          <p className="eyebrow">Active Ride</p>
          <h1>{rideId}</h1>
          <p>
            {displayName} ({role})
          </p>
        </div>

        <div className="ride-header-actions">
          {role === 'organizer' && (
            <>
              <button type="button" className="btn btn-secondary" onClick={copyRideCode}>
                Copy Invite Link
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRotateInvite}
                disabled={isRotatingInvite || isRideClosed}
              >
                {isRotatingInvite ? 'Rotating...' : 'Rotate Invite Link'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleCloseRide}
                disabled={isClosingRide || isRideClosed}
              >
                {isRideClosed ? 'Ride Closed' : isClosingRide ? 'Closing...' : 'Close Ride'}
              </button>
            </>
          )}
          <Link to="/" className="btn btn-secondary link-btn">
            Exit
          </Link>
        </div>
      </header>

      <section className="panel status-panel">
        <span className={`status-pill is-${rideState.connectionStatus}`}>
          Socket: {rideState.connectionStatus}
        </span>
        <span className={`status-pill ${isRideClosed ? 'is-error' : 'is-connected'}`}>
          Ride: {rideState.status}
        </span>
        <span className="status-pill">Invite: {inviteToken ? 'provided' : 'missing'}</span>
        {role === 'organizer' && (
          <span className="status-pill">Host token: {organizerToken ? 'present' : 'missing'}</span>
        )}
        <span className="status-pill">Pending telemetry: {pendingTelemetryCount}</span>
        <span className="status-pill">Telemetry events (local): {queue.length}</span>
        <span className="status-pill">Riders: {rideState.members.length}</span>
        {isDebugMode && <span className="status-pill">Socket URL: {SOCKET_URL}</span>}
      </section>

      {rideState.lastError && <p className="banner-error">{rideState.lastError}</p>}
      {isRideClosed && (
        <p className="banner-error">Ride closed by organizer at {formatClosedAt(rideState.closedAt)}.</p>
      )}

      <section className="panel map-panel">
        <MapCanvas
          locations={rideState.latestLocations}
          waypoints={rideState.waypoints}
          selfUserId={session.userId}
        />
      </section>

      <section className="panel controls-panel">
        <h2>Telemetry</h2>
        <p>
          Keep this tab active while riding. Adaptive polling slows updates when movement is low to
          preserve battery.
        </p>
        <button
          type="button"
          className={isSharingActive ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={() => setIsSharing((value) => !value)}
          disabled={isRideClosed}
        >
          {isSharingActive ? 'Pause Sharing' : 'Resume Sharing'}
        </button>
        <p className="hint-text">Sharing is {isSharingActive ? 'ON' : 'OFF'}</p>
        {isDemoTelemetry && <p className="hint-text">Mode: demo telemetry (HTTP local testing)</p>}
        <p className="hint-text">My location: {formatLastSeen(selfLocation?.recordedAt)}</p>
      </section>

      <section className="panel controls-panel">
        <h2>Waypoints</h2>
        <label htmlFor="waypoint-title">Title</label>
        <input
          id="waypoint-title"
          value={waypointTitle}
          onChange={(event) => setWaypointTitle(event.target.value)}
          placeholder="Fuel stop"
          maxLength={80}
          disabled={isRideClosed}
        />

        <label htmlFor="waypoint-note">Note</label>
        <textarea
          id="waypoint-note"
          value={waypointNote}
          onChange={(event) => setWaypointNote(event.target.value)}
          placeholder="Regroup here"
          maxLength={160}
          disabled={isRideClosed}
        />

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAddWaypoint}
          disabled={isRideClosed}
        >
          Add Waypoint At My Position
        </button>
      </section>

      <section className="panel list-panel">
        <h2>Riders</h2>
        <ul>
          {rideState.members.map((member) => {
            const location = rideState.latestLocations[member.userId]

            return (
              <li key={member.userId}>
                <strong>
                  {member.displayName}
                  {member.userId === session.userId ? ' (You)' : ''}
                </strong>
                <span>{formatLastSeen(location?.recordedAt)}</span>
              </li>
            )
          })}
          {rideState.members.length === 0 && <li>No riders connected yet.</li>}
        </ul>
      </section>

      <section className="panel list-panel">
        <h2>Waypoints ({rideState.waypoints.length})</h2>
        <ul>
          {rideState.waypoints.map((waypoint) => (
            <li key={waypoint.id}>
              <div>
                <strong>{waypoint.title}</strong>
                {waypoint.note && <span>{waypoint.note}</span>}
              </div>
              <button
                type="button"
                className="btn btn-subtle"
                onClick={() => handleRemoveWaypoint(waypoint.id)}
                disabled={isRideClosed}
              >
                Remove
              </button>
            </li>
          ))}
          {rideState.waypoints.length === 0 && <li>No waypoints added yet.</li>}
        </ul>
      </section>

      <footer className="legal-links">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Use</Link>
        <Link to="/delete-account">Delete My Data</Link>
      </footer>
    </main>
  )
}
