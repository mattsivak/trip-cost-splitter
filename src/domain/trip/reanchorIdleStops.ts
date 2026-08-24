import { slugify } from '../routing/routeToSegments'
import type { DriveSegment, Segment } from './types'

/**
 * Put idle stops back where they happened after the drives are replaced.
 *
 * A route lookup throws away every drive and builds new ones, so an idle stop
 * has nothing left to sit behind. Appending them all to the end — the previous
 * behaviour — is not merely untidy: a stop's fuel is split between whoever was
 * assigned to it, and moving it to the end of the route puts it next to the
 * wrong leg entirely.
 *
 * A stop is anchored to the place it happened at, not to a position, because
 * that is the thing that stays true when the user adds or removes a stop
 * elsewhere in the route. Places repeat — a trip through Olomouc three times
 * is normal — so the arrival is counted too: "the second time we reached
 * Olomouc". When no matching arrival survives in the new route, the stop falls
 * back to the same ordinal position, and failing that to the end.
 */
export function reanchorIdleStops(previous: readonly Segment[], drives: readonly DriveSegment[]): Segment[] {
  const placements = describePlacements(previous)

  /** Index into `drives` that each stop follows; -1 means before the first drive. */
  const anchored = placements.map((placement) => ({
    stop: placement.stop,
    after: resolveAnchor(placement, drives),
  }))

  const result: Segment[] = []
  for (const entry of anchored) if (entry.after === -1) result.push(entry.stop)

  drives.forEach((drive, index) => {
    result.push(drive)
    for (const entry of anchored) if (entry.after === index) result.push(entry.stop)
  })

  return result
}

interface Placement {
  stop: Segment
  /** The place the preceding drive arrived at, or null if the stop came first. */
  arrivedAt: string | null
  /** Which visit to that place it was: 1 for the first arrival, 2 for the next. */
  occurrence: number
  /** How many drives preceded the stop, for the fallback. */
  drivesBefore: number
}

function describePlacements(segments: readonly Segment[]): Placement[] {
  const placements: Placement[] = []
  const arrivals = new Map<string, number>()
  let drivesBefore = 0
  let lastArrival: string | null = null

  for (const segment of segments) {
    if (segment.kind === 'drive') {
      drivesBefore += 1
      lastArrival = slugify(segment.to)
      arrivals.set(lastArrival, (arrivals.get(lastArrival) ?? 0) + 1)
      continue
    }

    placements.push({
      stop: segment,
      arrivedAt: lastArrival,
      occurrence: lastArrival === null ? 0 : (arrivals.get(lastArrival) ?? 1),
      drivesBefore,
    })
  }

  return placements
}

function resolveAnchor(placement: Placement, drives: readonly DriveSegment[]): number {
  if (placement.arrivedAt === null) return -1

  let seen = 0
  for (const [index, drive] of drives.entries()) {
    if (slugify(drive.to) !== placement.arrivedAt) continue
    seen += 1
    if (seen === placement.occurrence) return index
  }

  // The place is gone from the route. Keep the stop roughly where it sat.
  return Math.min(placement.drivesBefore, drives.length) - 1
}
