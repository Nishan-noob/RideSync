const EARTH_RADIUS_M = 6_371_000

function toRadians(value: number): number {
  return (value * Math.PI) / 180
}

export function distanceMeters(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const deltaLat = toRadians(latB - latA)
  const deltaLng = toRadians(lngB - lngA)

  const startLat = toRadians(latA)
  const endLat = toRadians(latB)

  const formula =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2

  const arc = 2 * Math.atan2(Math.sqrt(formula), Math.sqrt(1 - formula))
  return EARTH_RADIUS_M * arc
}
