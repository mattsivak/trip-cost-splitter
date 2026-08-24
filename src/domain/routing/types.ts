export type ProviderId = 'osrm' | 'mapy'

export interface GeoPoint {
  label: string
  lat: number
  lon: number
  /** Region, district or whatever disambiguates two places with one name. */
  detail?: string
}

export interface RouteLeg {
  fromLabel: string
  toLabel: string
  distanceKm: number
  durationSeconds?: number
  geometry?: string
}

export interface RoutePlan {
  provider: ProviderId
  legs: RouteLeg[]
  totalDistanceKm: number
  totalDurationSeconds?: number
}

/**
 * Everything the app needs from a mapping service. Implementations take their
 * own `fetch`, which is what lets them be tested against recorded responses
 * instead of the live internet.
 */
export interface RouteProvider {
  readonly id: ProviderId
  geocode(query: string, signal?: AbortSignal): Promise<GeoPoint[]>
  route(points: readonly GeoPoint[], signal?: AbortSignal): Promise<RoutePlan>
}

export type Fetcher = (
  input: string,
  // `| undefined` is deliberate: callers forward an optional signal straight
  // through, and exactOptionalPropertyTypes would otherwise reject that.
  init?: { signal?: AbortSignal | undefined; headers?: Record<string, string> | undefined },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
  ) {
    super(message)
    this.name = 'RoutingError'
  }
}

export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 10) / 10
}
