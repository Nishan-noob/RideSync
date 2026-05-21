import { useEffect, useRef } from 'react'

import type { Coordinate, Waypoint } from '@ridesync/shared'
import maplibregl, { Marker, type Map as MapLibreMap } from 'maplibre-gl'

type MapCanvasProps = {
  locations: Record<string, Coordinate>
  waypoints: Waypoint[]
  selfUserId: string
  selectedPosition?: Coordinate | null
  onMapSelect?: (position: Coordinate) => void
  isSelectionEnabled?: boolean
}

const DEFAULT_CENTER: [number, number] = [77.5946, 12.9716]
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildWaypointPopupHtml(waypoint: Waypoint): string {
  const title = escapeHtml(waypoint.title)
  const note = waypoint.note ? escapeHtml(waypoint.note) : ''
  const lat = waypoint.position.lat.toFixed(6)
  const lng = waypoint.position.lng.toFixed(6)
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${waypoint.position.lat},${waypoint.position.lng}`,
  )}`

  return `
    <div class="waypoint-popup">
      <p class="waypoint-popup-title">${title}</p>
      ${note ? `<p class="waypoint-popup-note">${note}</p>` : ''}
      <p class="waypoint-popup-coords">${lat}, ${lng}</p>
      <a class="waypoint-popup-link" href="${navUrl}" target="_blank" rel="noreferrer">Navigate</a>
    </div>
  `
}

function createRiderMarker(isSelf: boolean): HTMLDivElement {
  const markerElement = document.createElement('div')
  markerElement.className = 'map-marker rider-marker'

  if (isSelf) {
    markerElement.classList.add('is-self')
  }

  return markerElement
}

function createWaypointMarker(): HTMLDivElement {
  const markerElement = document.createElement('div')
  markerElement.className = 'map-marker waypoint-marker'
  return markerElement
}

function createSelectionMarker(): HTMLDivElement {
  const markerElement = document.createElement('div')
  markerElement.className = 'map-marker selection-marker'
  return markerElement
}

export function MapCanvas({
  locations,
  waypoints,
  selfUserId,
  selectedPosition = null,
  onMapSelect,
  isSelectionEnabled = false,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const hasCenteredRef = useRef(false)
  const riderMarkersRef = useRef<Map<string, Marker>>(new Map())
  const waypointMarkersRef = useRef<Map<string, Marker>>(new Map())
  const selectionMarkerRef = useRef<Marker | null>(null)

  useEffect(() => {
    if (mapRef.current || !containerRef.current) {
      return
    }

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: {},
    })

    const riderMarkers = riderMarkersRef.current
    const waypointMarkers = waypointMarkersRef.current
    const selectionMarker = selectionMarkerRef.current

    return () => {
      riderMarkers.forEach((marker) => marker.remove())
      waypointMarkers.forEach((marker) => marker.remove())
      selectionMarker?.remove()
      riderMarkers.clear()
      waypointMarkers.clear()
      selectionMarkerRef.current = null

      mapRef.current?.remove()
      mapRef.current = null
      hasCenteredRef.current = false
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    for (const [userId, coordinate] of Object.entries(locations)) {
      const marker = riderMarkersRef.current.get(userId)

      if (marker) {
        marker.setLngLat([coordinate.lng, coordinate.lat])
      } else {
        const createdMarker = new maplibregl.Marker({
          element: createRiderMarker(userId === selfUserId),
          anchor: 'center',
        })
          .setLngLat([coordinate.lng, coordinate.lat])
          .addTo(map)

        riderMarkersRef.current.set(userId, createdMarker)
      }
    }

    for (const [userId, marker] of riderMarkersRef.current.entries()) {
      if (!(userId in locations)) {
        marker.remove()
        riderMarkersRef.current.delete(userId)
      }
    }

    if (!hasCenteredRef.current) {
      const firstCoordinate = Object.values(locations)[0]

      if (firstCoordinate) {
        map.flyTo({
          center: [firstCoordinate.lng, firstCoordinate.lat],
          zoom: 14,
          duration: 900,
        })
        hasCenteredRef.current = true
      }
    }
  }, [locations, selfUserId])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    for (const waypoint of waypoints) {
      const marker = waypointMarkersRef.current.get(waypoint.id)

      if (marker) {
        marker.setLngLat([waypoint.position.lng, waypoint.position.lat])
      } else {
        const createdMarker = new maplibregl.Marker({
          element: createWaypointMarker(),
          anchor: 'center',
        })
          .setLngLat([waypoint.position.lng, waypoint.position.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(buildWaypointPopupHtml(waypoint)))
          .addTo(map)

        waypointMarkersRef.current.set(waypoint.id, createdMarker)
      }
    }

    for (const [waypointId, marker] of waypointMarkersRef.current.entries()) {
      if (!waypoints.some((waypoint) => waypoint.id === waypointId)) {
        marker.remove()
        waypointMarkersRef.current.delete(waypointId)
      }
    }
  }, [waypoints])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !onMapSelect) {
      return
    }

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      if (!isSelectionEnabled) {
        return
      }

      const selected: Coordinate = {
        lat: event.lngLat.lat,
        lng: event.lngLat.lng,
        accuracyM: 12,
        recordedAt: Date.now(),
      }
      onMapSelect(selected)
    }

    map.on('click', handleClick)

    return () => {
      map.off('click', handleClick)
    }
  }, [isSelectionEnabled, onMapSelect])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    if (!selectedPosition) {
      selectionMarkerRef.current?.remove()
      selectionMarkerRef.current = null
      return
    }

    if (!selectionMarkerRef.current) {
      selectionMarkerRef.current = new maplibregl.Marker({
        element: createSelectionMarker(),
        anchor: 'center',
      })
        .setLngLat([selectedPosition.lng, selectedPosition.lat])
        .addTo(map)
      return
    }

    selectionMarkerRef.current.setLngLat([selectedPosition.lng, selectedPosition.lat])
  }, [selectedPosition])

  return <div ref={containerRef} className="map-canvas" />
}
