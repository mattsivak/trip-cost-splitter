import { accessFor } from '../../../src/domain/storage/tripRecord'
import { readTrip } from '../../utils/tripFiles'

/**
 * Read a trip. Either key opens it — the shared view needs the full trip to
 * show its working — but the response says which one was used so the client
 * knows whether to offer editing.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const key = String(getQuery(event).key ?? '')

  const record = await readTrip(id)
  // Same answer for "no such trip" and "wrong key", so the endpoint cannot be
  // used to find out which trips exist.
  if (!record) throw notFound()

  const access = accessFor(record, key)
  if (!access) throw notFound()

  return { trip: record.trip, access }
})

function notFound() {
  return createError({ statusCode: 404, statusMessage: 'No trip here.' })
}
