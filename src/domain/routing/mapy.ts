import { metersToKm, RoutingError, type Fetcher, type RoutePlan, type RouteProvider } from './types'
import { requireTwoPoints } from './osrm'

const BASE = 'https://api.mapy.com/v1'

interface MapyGeocodeResponse {
  items?: Array<{
    name?: string
    label?: string
    location?: string
    position?: { lat?: number; lon?: number }
  }>
}

interface MapyRouteResponse {
  length?: number
  duration?: number
}

/**
 * Mapy.com. Better than OSRM for Czech and Central European addresses, which
 * is the actual use case here — but it needs a key, so it only activates when
 * one is configured.
 *
 * Its routing endpoint answers for a single origin/destination pair, so a
 * multi-stop route is one request per consecutive pair. That is also what
 * gives us per-leg distances without asking for the full geometry back.
 */
export function createMapyProvider(fetcher: Fetcher, apiKey: string): RouteProvider {
  if (!apiKey) throw new RoutingError('Mapy.com needs an API key.', 'mapy')

  return {
    id: 'mapy',

    async geocode(query, signal) {
      const trimmed = query.trim()
      if (!trimmed) return []

      const url = `${BASE}/geocode?query=${encodeURIComponent(trimmed)}&lang=cs&limit=5&apikey=${encodeURIComponent(apiKey)}`
      const response = await fetcher(url, { signal })
      if (!response.ok) throw new RoutingError(`Place lookup failed (${response.status}).`, 'mapy')

      const body = (await response.json()) as MapyGeocodeResponse
      return (body.items ?? []).flatMap((item) => {
        const lat = item.position?.lat
        const lon = item.position?.lon
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []

        const label = item.name?.trim() || item.label?.trim() || trimmed
        const detail = item.location?.trim()
        return [
          detail
            ? { label, lat: lat as number, lon: lon as number, detail }
            : { label, lat: lat as number, lon: lon as number },
        ]
      })
    },

    async route(points, signal) {
      requireTwoPoints(points, 'mapy')

      const legs = []
      let totalMeters = 0
      let totalSeconds = 0
      let haveDurations = true

      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index]!
        const to = points[index + 1]!
        const url =
          `${BASE}/routing/route?start=${from.lon},${from.lat}&end=${to.lon},${to.lat}` +
          `&routeType=car_fast&lang=cs&apikey=${encodeURIComponent(apiKey)}`

        const response = await fetcher(url, { signal })
        if (!response.ok) throw new RoutingError(`Route lookup failed (${response.status}).`, 'mapy')

        const body = (await response.json()) as MapyRouteResponse
        if (body.length === undefined)
          throw new RoutingError(`No route found from ${from.label} to ${to.label}.`, 'mapy')

        totalMeters += body.length
        if (body.duration === undefined) haveDurations = false
        else totalSeconds += body.duration

        legs.push({
          fromLabel: from.label,
          toLabel: to.label,
          distanceKm: metersToKm(body.length),
          ...(body.duration === undefined ? {} : { durationSeconds: Math.round(body.duration) }),
        })
      }

      const plan: RoutePlan = { provider: 'mapy', legs, totalDistanceKm: metersToKm(totalMeters) }
      if (haveDurations) plan.totalDurationSeconds = Math.round(totalSeconds)
      return plan
    },
  }
}
