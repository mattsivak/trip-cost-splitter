import { accessFor } from '../../../../src/domain/storage/tripRecord'
import { nowIso } from '../../../../src/domain/trip/factories'
import { readTrip, writeTrip } from '../../../utils/tripFiles'

/**
 * Mark one person as having settled up, or unmark them.
 *
 * Open to the view key on purpose: the point is that whoever owes the money
 * can say so from the link they were sent. It is a note between friends, taken
 * on trust — the app cannot see a payment arrive and does not pretend to — so
 * this touches nothing but `paidAt`.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ key?: unknown; personId?: unknown; paid?: unknown }>(event)

  const record = await readTrip(id)
  if (!record) throw createError({ statusCode: 404, statusMessage: 'No trip here.' })
  if (!accessFor(record, String(body?.key ?? ''))) {
    throw createError({ statusCode: 403, statusMessage: 'Wrong key.' })
  }

  const personId = String(body?.personId ?? '')
  if (!record.trip.people.some((person) => person.id === personId)) {
    throw createError({ statusCode: 400, statusMessage: 'Nobody on this trip by that name.' })
  }

  const paidAt =
    body?.paid === false
      ? Object.fromEntries(Object.entries(record.trip.paidAt).filter(([id]) => id !== personId))
      : { ...record.trip.paidAt, [personId]: nowIso() }

  const trip = { ...record.trip, paidAt, updatedAt: nowIso() }
  await writeTrip(id, { ...record, trip })
  return { paidAt: trip.paidAt }
})
