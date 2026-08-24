import {
  metersToKm,
  RoutingError,
  type Fetcher,
  type GeoPoint,
  type RoutePlan,
  type RouteProvider,
} from './types'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OSRM = 'https://router.project-osrm.org/route/v1/driving'

/** Nominatim asks for a contact string; sending one is the price of the free tier. */
const USER_AGENT = 'trip-cost-splitter (https://github.com/mattsivak/trip-cost-splitter)'

interface NominatimHit {
  display_name?: string
  name?: string
  lat?: string
  lon?: string
}

interface OsrmResponse {
  code?: string
  routes?: Array<{
    distance?: number
    duration?: number
    legs?: Array<{ distance?: number; duration?: number }>
  }>
}

/**
 * The keyless default: OpenStreetMap for places, the public OSRM demo server
 * for distances. Works with zero configuration, which is why it is the
 * fallback — the demo server is rate-limited and offers no uptime promise.
 */
export function createOsrmProvider(fetcher: Fetcher): RouteProvider {
  return {
    id: 'osrm',

    async geocode(query, signal) {
      const trimmed = query.trim()
      if (!trimmed) return []

      const url = `${NOMINATIM}?q=${encodeURIComponent(trimmed)}&format=jsonv2&limit=5&addressdetails=0`
      const response = await fetcher(url, {
        signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      })
      if (!response.ok) throw new RoutingError(`Place lookup failed (${response.status}).`, 'osrm')

      const hits = (await response.json()) as NominatimHit[]
      if (!Array.isArray(hits)) return []

      return hits.flatMap((hit) => {
        const lat = Number(hit.lat)
        const lon = Number(hit.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []

        const parts = (hit.display_name ?? '').split(',').map((part) => part.trim())
        const label = hit.name?.trim() || parts[0] || trimmed
        const detail = parts.slice(1, 3).filter(Boolean).join(', ')
        return [detail ? { label, lat, lon, detail } : { label, lat, lon }]
      })
    },

    async route(points, signal) {
      requireTwoPoints(points, 'osrm')

      const path = points.map((point) => `${point.lon},${point.lat}`).join(';')
      const response = await fetcher(`${OSRM}/${path}?overview=false&steps=false`, { signal })
      if (!response.ok) throw new RoutingError(`Route lookup failed (${response.status}).`, 'osrm')

      const body = (await response.json()) as OsrmResponse
      const route = body.routes?.[0]
      if (body.code && body.code !== 'Ok') throw new RoutingError(`No route found (${body.code}).`, 'osrm')
      if (!route) throw new RoutingError('No route found between those places.', 'osrm')

      const legs = (route.legs ?? []).map((leg, index) => ({
        fromLabel: points[index]?.label ?? '',
        toLabel: points[index + 1]?.label ?? '',
        distanceKm: metersToKm(leg.distance ?? 0),
        ...(leg.duration === undefined ? {} : { durationSeconds: Math.round(leg.duration) }),
      }))

      const plan: RoutePlan = {
        provider: 'osrm',
        legs,
        totalDistanceKm: metersToKm(route.distance ?? 0),
      }
      if (route.duration !== undefined) plan.totalDurationSeconds = Math.round(route.duration)
      return plan
    },
  }
}

export function requireTwoPoints(points: readonly GeoPoint[], provider: 'osrm' | 'mapy'): void {
  if (points.length < 2) throw new RoutingError('A route needs at least two places.', provider)
}
