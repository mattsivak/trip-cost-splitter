import type { DriveSegment, PersonId } from '../trip/types'
import type { RoutePlan } from './types'

/**
 * Turn a provider's answer into editable trip segments.
 *
 * Everything the provider gives us is a starting point, not a fact: the user
 * can change any distance afterwards, and `distanceSource` records where the
 * number came from so the UI can say so.
 */
export function routeToSegments(route: RoutePlan, occupantIds: readonly PersonId[] = []): DriveSegment[] {
  return route.legs.map((leg, index) => {
    const segment: DriveSegment = {
      kind: 'drive',
      id: `leg-${index + 1}-${slugify(leg.fromLabel)}-${slugify(leg.toLabel)}`,
      label: `${leg.fromLabel} → ${leg.toLabel}`,
      from: leg.fromLabel,
      to: leg.toLabel,
      distanceKm: leg.distanceKm,
      distanceSource: route.provider,
      occupantIds: [...occupantIds],
    }

    if (leg.durationSeconds !== undefined) segment.durationSeconds = leg.durationSeconds
    if (leg.geometry !== undefined) segment.geometry = leg.geometry
    return segment
  })
}

export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'stop'
  )
}
