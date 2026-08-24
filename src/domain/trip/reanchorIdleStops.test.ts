import { describe, expect, it } from 'vitest'
import { reanchorIdleStops } from './reanchorIdleStops'
import type { DriveSegment, IdleSegment, Segment } from './types'

function drive(from: string, to: string): DriveSegment {
  return {
    kind: 'drive',
    id: `${from}-${to}`,
    label: `${from} → ${to}`,
    from,
    to,
    distanceKm: 10,
    distanceSource: 'osrm',
    occupantIds: [],
  }
}

function idle(id: string, location = ''): IdleSegment {
  return { kind: 'idle', id, label: `Waiting at ${location}`, location, liters: 5, occupantIds: [] }
}

const labels = (segments: Segment[]) => segments.map((segment) => segment.id)

describe('reanchorIdleStops', () => {
  it('keeps a stop behind the drive that arrived where it happened', () => {
    const previous = [drive('A', 'B'), idle('wait', 'B'), drive('B', 'C')]
    const rebuilt = [drive('A', 'B'), drive('B', 'C')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['A-B', 'wait', 'B-C'])
  })

  it('follows the place when a new stop is inserted earlier in the route', () => {
    const previous = [drive('A', 'B'), drive('B', 'C'), idle('wait', 'C')]
    // The user adds a detour through X at the start; C is now reached later.
    const rebuilt = [drive('A', 'X'), drive('X', 'B'), drive('B', 'C')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['A-X', 'X-B', 'B-C', 'wait'])
  })

  it('follows the place when a stop is removed from earlier in the route', () => {
    const previous = [drive('A', 'X'), drive('X', 'B'), idle('wait', 'B'), drive('B', 'C')]
    const rebuilt = [drive('A', 'B'), drive('B', 'C')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['A-B', 'wait', 'B-C'])
  })

  it('tells repeated visits to the same place apart', () => {
    // Olomouc three times, with the stop on the second arrival.
    const previous = [
      drive('Šumperk', 'Olomouc'),
      drive('Olomouc', 'Milovice'),
      drive('Milovice', 'Olomouc'),
      idle('canister', 'Olomouc'),
      drive('Olomouc', 'Vsetín'),
      drive('Vsetín', 'Olomouc'),
    ]
    const rebuilt = previous.filter((segment): segment is DriveSegment => segment.kind === 'drive')

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual([
      'Šumperk-Olomouc',
      'Olomouc-Milovice',
      'Milovice-Olomouc',
      'canister',
      'Olomouc-Vsetín',
      'Vsetín-Olomouc',
    ])
  })

  it('ignores diacritics and casing when matching a place', () => {
    const previous = [drive('A', 'Vsetín'), idle('wait', 'Vsetín')]
    const rebuilt = [drive('A', 'vsetin')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['A-vsetin', 'wait'])
  })

  it('keeps a stop that came before any drive at the front', () => {
    const previous = [idle('warmup'), drive('A', 'B')]
    const rebuilt = [drive('A', 'B')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['warmup', 'A-B'])
  })

  it('falls back to roughly the same position when the place is gone', () => {
    const previous = [drive('A', 'B'), idle('wait', 'B'), drive('B', 'C')]
    // B is no longer on the route at all.
    const rebuilt = [drive('A', 'Q'), drive('Q', 'C')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['A-Q', 'wait', 'Q-C'])
  })

  it('appends when the new route is shorter than where the stop sat', () => {
    const previous = [drive('A', 'B'), drive('B', 'C'), drive('C', 'D'), idle('wait', 'D')]
    const rebuilt = [drive('A', 'Q')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['A-Q', 'wait'])
  })

  it('keeps the order of two stops at the same place', () => {
    const previous = [drive('A', 'B'), idle('first', 'B'), idle('second', 'B'), drive('B', 'C')]
    const rebuilt = [drive('A', 'B'), drive('B', 'C')]

    expect(labels(reanchorIdleStops(previous, rebuilt))).toEqual(['A-B', 'first', 'second', 'B-C'])
  })

  it('never loses or duplicates a stop', () => {
    const previous = [
      idle('a'),
      drive('A', 'B'),
      idle('b', 'B'),
      drive('B', 'C'),
      idle('c', 'C'),
      idle('d', 'C'),
      drive('C', 'D'),
    ]
    const rebuilt = [drive('A', 'B'), drive('B', 'Z')]

    const result = reanchorIdleStops(previous, rebuilt)
    expect(
      result
        .filter((segment) => segment.kind === 'idle')
        .map((segment) => segment.id)
        .sort(),
    ).toEqual(['a', 'b', 'c', 'd'])
    expect(result).toHaveLength(6)
  })

  it('handles a route with no idle stops', () => {
    const rebuilt = [drive('A', 'B')]
    expect(reanchorIdleStops([drive('X', 'Y')], rebuilt)).toEqual(rebuilt)
  })

  it('keeps the stops when the new route has no drives at all', () => {
    const previous = [drive('A', 'B'), idle('wait', 'B')]
    expect(labels(reanchorIdleStops(previous, []))).toEqual(['wait'])
  })
})
