import { RoutingError } from '../../../src/domain/routing/types'
import { resolveProvider } from '../../utils/provider'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ query?: unknown }>(event)
  const query = typeof body?.query === 'string' ? body.query.trim() : ''

  if (!query) throw createError({ statusCode: 400, statusMessage: 'Give me a place to look up.' })

  const provider = resolveProvider(useRuntimeConfig(event).mapyApiKey)

  try {
    return { provider: provider.id, results: await provider.geocode(query) }
  } catch (error) {
    throw toHttpError(error)
  }
})

function toHttpError(error: unknown) {
  if (error instanceof RoutingError) {
    // 502: our upstream let us down, not the caller's fault.
    return createError({ statusCode: 502, statusMessage: error.message })
  }
  return createError({ statusCode: 502, statusMessage: 'The place lookup is unavailable right now.' })
}
