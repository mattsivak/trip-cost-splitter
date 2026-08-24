import { parseTrip } from '../../../src/domain/storage/serialization'
import { createTrip } from '../../utils/tripFiles'

/** Put a new trip on the server and hand back the two keys that reach it. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ trip?: unknown }>(event)
  const trip = parseTrip(body?.trip)

  if (!trip) throw createError({ statusCode: 400, statusMessage: 'That is not a trip.' })

  const record = await createTrip(trip)
  setResponseStatus(event, 201)
  return { id: record.trip.id, viewKey: record.viewKey, editKey: record.editKey, trip: record.trip }
})
