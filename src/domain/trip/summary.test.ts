import { describe, expect, it } from 'vitest'
import { fromMajor } from '../money/money'
import { calculateTrip } from './calculateTrip'
import { formatTripSummary } from './summary'
import { makeDrive, makeTrip } from './testing'

const trip = makeTrip({
  title: 'Weekend run',
  pricing: { mode: 'from-receipts' },
  defaultConsumptionLPer100Km: 10,
  segments: [
    makeDrive({ id: 'd1', distanceKm: 100, occupantIds: ['ann', 'bo', 'cy'] }),
    makeDrive({ id: 'd2', distanceKm: 100, occupantIds: ['ann', 'bo'] }),
  ],
  receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(900) }],
})

describe('formatTripSummary', () => {
  const summary = formatTripSummary(trip, calculateTrip(trip))

  it('leads with the trip and its totals', () => {
    expect(summary).toContain('Weekend run — fuel split')
    expect(summary).toContain('200 km · 20 L · 900 Kč total')
  })

  it('names the driver and what they are carrying', () => {
    expect(summary).toContain('Ann paid up front and covers')
  })

  it('lists what each passenger owes, largest first', () => {
    const bo = summary.indexOf('Bo:')
    const cy = summary.indexOf('Cy:')
    expect(bo).toBeGreaterThan(-1)
    expect(cy).toBeGreaterThan(bo)
  })

  it('leaves the driver out of the collection list', () => {
    expect(summary).not.toMatch(/^ {2}Ann:/m)
  })

  it('says so plainly when there is nothing to collect', () => {
    const solo = makeTrip({ segments: [makeDrive({ occupantIds: ['ann'] })] })
    expect(formatTripSummary(solo, calculateTrip(solo))).toContain('(nothing to collect)')
  })

  it('calls out a shortfall between receipts and the split', () => {
    const underBilled = makeTrip({
      segments: [makeDrive({ distanceKm: 10, occupantIds: ['ann', 'bo'] })],
      receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(2000) }],
    })
    expect(formatTripSummary(underBilled, calculateTrip(underBilled))).toContain(
      'more than this split covers',
    )
  })

  it('mentions overhead only when there is some', () => {
    expect(summary).not.toContain('tolls, parking')
    const withTolls = makeTrip({
      ...trip,
      overheadCosts: [{ id: 'o1', label: 'Tolls', amount: fromMajor(300), allocation: { type: 'even' } }],
    })
    expect(formatTripSummary(withTolls, calculateTrip(withTolls))).toContain('tolls, parking')
  })
})
