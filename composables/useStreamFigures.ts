import type { StreamId } from '~/src/domain/trip/types'

/**
 * Reading and writing one stream's figure inside a per-stream record.
 *
 * The records these edit are sparse on purpose: a leg that says nothing about
 * a stream falls back to the trip-wide figure, and that is not the same as a
 * leg that says zero. So blanking an input has to remove the key rather than
 * write a `0` that would quietly claim the engine never ran.
 */

/** What to show in the input. Empty string means "no figure of its own". */
export function readFigure(record: Record<StreamId, number> | undefined, streamId: StreamId): string {
  const value = record?.[streamId]
  return value === undefined ? '' : String(value)
}

/**
 * The record with `streamId` set to `raw`, or with that key gone when `raw` is
 * blank. Returns undefined once nothing is left, so an untouched leg stays
 * untouched rather than carrying an empty object around.
 */
export function writeFigure(
  record: Record<StreamId, number> | undefined,
  streamId: StreamId,
  raw: string,
): Record<StreamId, number> | undefined {
  const value = Number(raw)
  const blank = raw.trim() === '' || !Number.isFinite(value)

  const next: Record<StreamId, number> = {}
  for (const [id, quantity] of Object.entries(record ?? {})) {
    if (id !== streamId) next[id] = quantity
  }
  if (!blank) next[streamId] = value

  return Object.keys(next).length > 0 ? next : undefined
}

/** As `writeFigure`, for a record that must exist even when it is empty. */
export function writeRequiredFigure(
  record: Record<StreamId, number>,
  streamId: StreamId,
  raw: string,
): Record<StreamId, number> {
  return writeFigure(record, streamId, raw) ?? {}
}
