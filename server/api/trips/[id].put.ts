import { parseTrip } from '../../../src/domain/storage/serialization'
import { accessFor } from '../../../src/domain/storage/tripRecord'
import { nowIso } from '../../../src/domain/trip/factories'
import { readTrip, writeTrip } from '../../utils/tripFiles'

/** Replace a trip. Edit key only. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ key?: unknown; trip?: unknown }>(event)

  const record = await readTrip(id)
  if (!record) throw createError({ statusCode: 404, statusMessage: 'No trip here.' })

  if (accessFor(record, String(body?.key ?? '')) !== 'edit') {
    throw createError({ statusCode: 403, statusMessage: 'That key cannot change this trip.' })
  }

  const trip = parseTrip(body?.trip)
  if (!trip) throw createError({ statusCode: 400, statusMessage: 'That is not a trip.' })

  // The id is the file name; a body claiming a different one must not move it.
  const updated = { ...trip, id, updatedAt: nowIso() }
  await writeTrip(id, { ...record, trip: updated })
  return { trip: updated }
})
