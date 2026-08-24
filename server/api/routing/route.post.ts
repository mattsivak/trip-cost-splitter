import { RoutingError, type GeoPoint } from '../../../src/domain/routing/types'
import { resolveProvider } from '../../utils/provider'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ points?: unknown }>(event)
  const points = parsePoints(body?.points)

  if (points.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A route needs at least two places with coordinates.',
    })
  }

  const provider = resolveProvider(useRuntimeConfig(event).mapyApiKey)

  try {
    return await provider.route(points)
  } catch (error) {
    if (error instanceof RoutingError) throw createError({ statusCode: 502, statusMessage: error.message })
    throw createError({ statusCode: 502, statusMessage: 'The route lookup is unavailable right now.' })
  }
})

function parsePoints(value: unknown): GeoPoint[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { label, lat, lon } = entry as Record<string, unknown>
    if (typeof lat !== 'number' || typeof lon !== 'number') return []
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
    return [{ label: typeof label === 'string' ? label : '', lat, lon }]
  })
}
