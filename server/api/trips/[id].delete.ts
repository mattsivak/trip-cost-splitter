import { accessFor } from '../../../src/domain/storage/tripRecord'
import { deleteTrip, readTrip } from '../../utils/tripFiles'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const key = String(getQuery(event).key ?? '')

  const record = await readTrip(id)
  if (!record) return { deleted: true }

  if (accessFor(record, key) !== 'edit') {
    throw createError({ statusCode: 403, statusMessage: 'That key cannot delete this trip.' })
  }

  await deleteTrip(id)
  return { deleted: true }
})
