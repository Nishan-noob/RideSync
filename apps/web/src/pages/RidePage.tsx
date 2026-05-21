import { useEffect, useMemo, useRef, useState } from 'react'

import type { Coordinate, RideRole, RideSnapshotPayload } from '@ridesync/shared'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { MapCanvas } from '../components/MapCanvas'
import { API_BASE_URL, SOCKET_URL } from '../config'
import { useAdaptiveTelemetry } from '../hooks/useAdaptiveTelemetry'
import { useRideSocket } from '../hooks/useRideSocket'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import {
  clearRideError,
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

function buildNavigationUrl(position: Coordinate): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${position.lat},${position.lng}`,
  )}`
}

type PlaceCandidate = {
  id: string
  title: string
  subtitle: string
  position: Coordinate
}

type ToastLevel = 'info' | 'success' | 'error'

type ToastMessage = {
  id: number
  level: ToastLevel
  message: string
}

function humanizeRideError(message: string): string {
  if (message.includes('Failed to fetch')) {
    return 'Could not reach the server. Please check your connection and try again.'
  }

  if (message.includes('Snapshot request failed with 403')) {
    return 'This invite link is no longer valid for this ride.'
  }

  if (message.includes('Snapshot request failed with 404')) {
    return 'This ride was not found. Check the invite link and try again.'
  }

  return message
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
  const [waypointQuery, setWaypointQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<PlaceCandidate[]>([])
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false)
  const [selectedWaypointPosition, setSelectedWaypointPosition] = useState<Coordinate | null>(null)
  const [isRotatingInvite, setIsRotatingInvite] = useState(false)
  const [isClosingRide, setIsClosingRide] = useState(false)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [editingWaypointId, setEditingWaypointId] = useState<string | null>(null)
  const [editWaypointTitle, setEditWaypointTitle] = useState('')
  const [editWaypointNote, setEditWaypointNote] = useState('')
  const previousConnectionRef = useRef(rideState.connectionStatus)

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

  const pushToast = (level: ToastLevel, message: string) => {
    const toastId = Date.now() + Math.floor(Math.random() * 1_000)
    setToasts((current) => [...current, { id: toastId, level, message }].slice(-5))

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== toastId))
    }, 4_200)
  }

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      pushToast('success', 'Back online. Syncing with the ride...')
    }

    const handleOffline = () => {
      setIsOffline(true)
      pushToast('info', 'You are offline. Telemetry will sync after reconnect.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const previous = previousConnectionRef.current

    if (previous !== 'connected' && rideState.connectionStatus === 'connected') {
      pushToast('success', 'Connected to ride.')
    }

    previousConnectionRef.current = rideState.connectionStatus
  }, [rideState.connectionStatus])

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
        dispatch(setRideError(humanizeRideError(message)))
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
      pushToast('success', 'Invite link rotated. Old invite links no longer work.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not rotate invite link.'
      dispatch(setRideError(humanizeRideError(message)))
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
      pushToast('info', 'Ride is now closed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not close ride.'
      dispatch(setRideError(humanizeRideError(message)))
    } finally {
      setIsClosingRide(false)
    }
  }

  const handleMapSelect = (position: Coordinate) => {
    if (isRideClosed) {
      return
    }

    setSelectedWaypointPosition(position)
    if (!waypointTitle.trim()) {
      setWaypointTitle('Pinned waypoint')
    }
  }

  const handleSearchWaypointPlaces = async () => {
    const query = waypointQuery.trim()

    if (!query) {
      setPlaceResults([])
      return
    }

    setIsSearchingPlaces(true)

    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('q', query)
      url.searchParams.set('limit', '5')

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Place search failed with ${response.status}`)
      }

      const payload = (await response.json()) as Array<{
        place_id?: number
        lat: string
        lon: string
        display_name?: string
        name?: string
      }>

      const mapped: PlaceCandidate[] = []

      payload.forEach((result, index) => {
        const lat = Number(result.lat)
        const lng = Number(result.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return
        }

        const display = result.display_name ?? 'Unnamed place'
        const [title, ...rest] = display.split(',')

        mapped.push({
          id: String(result.place_id ?? index),
          title: (result.name || title || 'Waypoint').trim(),
          subtitle: rest.join(',').trim(),
          position: {
            lat,
            lng,
            accuracyM: 20,
            recordedAt: Date.now(),
          },
        })
      })

      setPlaceResults(mapped)
      if (mapped.length === 0) {
        dispatch(setRideError('No matching places found. Try a broader search.'))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not search places.'
      dispatch(setRideError(humanizeRideError(message)))
    } finally {
      setIsSearchingPlaces(false)
    }
  }

  const handleSelectPlace = (place: PlaceCandidate) => {
    setSelectedWaypointPosition(place.position)
    setWaypointTitle(place.title)
    setWaypointQuery(place.title)
    setPlaceResults([])
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

    const chosenPosition = selectedWaypointPosition
      ? {
          ...selectedWaypointPosition,
          recordedAt: Date.now(),
        }
      : selfLocation
        ? {
            ...selfLocation,
            recordedAt: Date.now(),
          }
        : fallbackWaypointPosition()

    socket.emit('waypoint:add', {
      rideId,
      userId: session.userId,
      title,
      note: waypointNote.trim() || undefined,
      position: chosenPosition,
    })

    if (selectedWaypointPosition) {
      pushToast('success', 'Waypoint added from selected map/search location.')
    } else if (!selfLocation) {
      pushToast('info', 'No GPS lock yet. Waypoint was placed using demo position.')
    }

    setWaypointTitle('')
    setWaypointNote('')
    setWaypointQuery('')
    setPlaceResults([])
    setSelectedWaypointPosition(null)
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

  const startWaypointEdit = (waypointId: string) => {
    const waypoint = rideState.waypoints.find((item) => item.id === waypointId)
    if (!waypoint) {
      return
    }

    setEditingWaypointId(waypointId)
    setEditWaypointTitle(waypoint.title)
    setEditWaypointNote(waypoint.note ?? '')
  }

  const cancelWaypointEdit = () => {
    setEditingWaypointId(null)
    setEditWaypointTitle('')
    setEditWaypointNote('')
  }

  const saveWaypointEdit = () => {
    if (!editingWaypointId) {
      return
    }

    const socket = socketRef.current
    if (!socket || !socket.connected) {
      dispatch(setRideError('Socket is disconnected. Reconnect to edit waypoint.'))
      return
    }

    const waypoint = rideState.waypoints.find((item) => item.id === editingWaypointId)
    if (!waypoint) {
      cancelWaypointEdit()
      return
    }

    const title = editWaypointTitle.trim()
    if (!title) {
      dispatch(setRideError('Waypoint title is required.'))
      return
    }

    socket.emit('waypoint:add', {
      rideId,
      userId: session.userId,
      title,
      note: editWaypointNote.trim() || undefined,
      position: {
        ...waypoint.position,
        recordedAt: Date.now(),
      },
    })

    socket.emit('waypoint:remove', {
      rideId,
      waypointId: editingWaypointId,
      userId: session.userId,
    })

    pushToast('success', 'Waypoint details updated.')
    cancelWaypointEdit()
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

      pushToast('success', 'Invite link copied.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not copy code.'
      window.prompt('Copy this invite link manually:', inviteLink)
      dispatch(setRideError(humanizeRideError(`Could not copy invite link automatically: ${message}`)))
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
          {rideState.connectionStatus === 'connected'
            ? 'Connected'
            : rideState.connectionStatus === 'error'
              ? 'Connection issue'
              : 'Reconnecting'}
        </span>
        <span className={`status-pill ${isRideClosed ? 'is-error' : 'is-connected'}`}>
          Ride: {rideState.status === 'closed' ? 'Closed' : 'Active'}
        </span>
        <span className="status-pill">Sharing: {isSharingActive ? 'On' : 'Paused'}</span>
        <span className="status-pill">Riders: {rideState.members.length}</span>
        <button
          type="button"
          className="btn btn-subtle btn-diagnostics"
          onClick={() => setIsDiagnosticsOpen((value) => !value)}
        >
          {isDiagnosticsOpen ? 'Hide Diagnostics' : 'Show Diagnostics'}
        </button>
      </section>

      {isOffline && (
        <p className="notice-banner notice-banner-info">
          You are offline. Updates will resume automatically after reconnect.
        </p>
      )}

      {isDiagnosticsOpen && (
        <section className="panel diagnostics-panel">
          <span className="status-pill">Invite: {inviteToken ? 'provided' : 'missing'}</span>
          {role === 'organizer' && (
            <span className="status-pill">Host token: {organizerToken ? 'present' : 'missing'}</span>
          )}
          <span className="status-pill">Pending telemetry: {pendingTelemetryCount}</span>
          <span className="status-pill">Telemetry events (local): {queue.length}</span>
          {isDebugMode && <span className="status-pill">Socket URL: {SOCKET_URL}</span>}
          {isDemoTelemetry && <span className="status-pill">Mode: demo telemetry</span>}
        </section>
      )}

      {isRideClosed && (
        <p className="notice-banner notice-banner-warning">
          Ride closed by organizer at {formatClosedAt(rideState.closedAt)}.
        </p>
      )}

      {toasts.length > 0 && (
        <section className="toast-stack" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-item toast-${toast.level}`}>
              {toast.message}
            </div>
          ))}
        </section>
      )}

      {rideState.lastError && (
        <section className="toast-stack toast-stack-secondary" aria-live="polite" aria-atomic="false">
          <div className="toast-item toast-error toast-with-action">
            <span>{humanizeRideError(rideState.lastError)}</span>
            <button type="button" className="btn btn-subtle" onClick={() => dispatch(clearRideError())}>
              Dismiss
            </button>
          </div>
        </section>
      )}

      <section className="panel map-panel">
        <MapCanvas
          locations={rideState.latestLocations}
          waypoints={rideState.waypoints}
          selfUserId={session.userId}
          selectedPosition={selectedWaypointPosition}
          onMapSelect={handleMapSelect}
          isSelectionEnabled={!isRideClosed}
        />
        <p className="hint-text map-hint">
          Tap the map to pin a waypoint location. You can still use your current location with one
          click.
        </p>
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
        <label htmlFor="waypoint-search">Find place</label>
        <div className="search-row">
          <input
            id="waypoint-search"
            value={waypointQuery}
            onChange={(event) => setWaypointQuery(event.target.value)}
            placeholder="Search petrol pump, cafe, checkpoint"
            maxLength={100}
            disabled={isRideClosed || isSearchingPlaces}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSearchWaypointPlaces}
            disabled={isRideClosed || isSearchingPlaces}
          >
            {isSearchingPlaces ? 'Searching...' : 'Search'}
          </button>
        </div>
        {placeResults.length > 0 && (
          <ul className="search-results">
            {placeResults.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => handleSelectPlace(place)}
                  disabled={isRideClosed}
                >
                  <strong>{place.title}</strong>
                  {place.subtitle && <span>{place.subtitle}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

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
          Add Waypoint
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setSelectedWaypointPosition(null)
            setPlaceResults([])
            setWaypointQuery('')
          }}
          disabled={isRideClosed}
        >
          Use My Current Location
        </button>
        <p className="hint-text">
          Location source:{' '}
          {selectedWaypointPosition ? 'selected map/search location' : 'your current location'}
        </p>
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
          {rideState.waypoints.map((waypoint) => {
            const isEditing = editingWaypointId === waypoint.id

            return (
              <li key={waypoint.id}>
                <div className="waypoint-row">
                  {isEditing ? (
                    <div className="waypoint-editor">
                      <label htmlFor={`edit-title-${waypoint.id}`}>Title</label>
                      <input
                        id={`edit-title-${waypoint.id}`}
                        value={editWaypointTitle}
                        onChange={(event) => setEditWaypointTitle(event.target.value)}
                        maxLength={80}
                        disabled={isRideClosed}
                      />
                      <label htmlFor={`edit-note-${waypoint.id}`}>Note</label>
                      <textarea
                        id={`edit-note-${waypoint.id}`}
                        value={editWaypointNote}
                        onChange={(event) => setEditWaypointNote(event.target.value)}
                        maxLength={160}
                        disabled={isRideClosed}
                      />
                      <div className="waypoint-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={saveWaypointEdit}
                          disabled={isRideClosed}
                        >
                          Save
                        </button>
                        <button type="button" className="btn btn-subtle" onClick={cancelWaypointEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>{waypoint.title}</strong>
                        {waypoint.note && <span>{waypoint.note}</span>}
                      </div>
                      <div className="waypoint-actions">
                        <a
                          className="btn btn-subtle icon-btn"
                          href={buildNavigationUrl(waypoint.position)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <svg
                            className="nav-icon"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M21 3L3 10.53L10.05 12.95L12.47 20L21 3Z" />
                          </svg>
                          <span>Navigate</span>
                        </a>
                        <button
                          type="button"
                          className="btn btn-subtle"
                          onClick={() => startWaypointEdit(waypoint.id)}
                          disabled={isRideClosed}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-subtle"
                          onClick={() => handleRemoveWaypoint(waypoint.id)}
                          disabled={isRideClosed}
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            )
          })}
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
