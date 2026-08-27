import { describe, expect, it } from 'vitest'
import { fromMajor } from '../money/money'
import { calculateTrip } from './calculateTrip'
import { formatTripSummary } from './summary'
import { makeDrive, makeTrip } from './testing'

const trip = makeTrip({
  title: 'Weekend run',
  pricing: { mode: 'from-receipts' },
  consumptionPer100Km: 10,
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
    expect(summary).toContain('200 km · 20,0 L · 900 Kč total')
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

  it('reports the trip in its own unit', () => {
    const electric = makeTrip({ ...trip, energyKind: 'electric' })
    expect(formatTripSummary(electric, calculateTrip(electric))).toContain('200 km · 20,0 kWh')
  })

  it('leaves litres out when the trip is priced by the kilometre', () => {
    const perKm = makeTrip({
      ...trip,
      pricing: { mode: 'per-km', ratePerKm: fromMajor(4) },
    })
    const text = formatTripSummary(perKm, calculateTrip(perKm))
    expect(text).toContain('200 km · 800 Kč total')
    expect(text).not.toContain('L ·')
  })

  it('calls out wear and tear only when some is being charged', () => {
    expect(summary).not.toContain('wear and tear')

    const withUpkeep = makeTrip({ ...trip, maintenancePerKm: fromMajor(2) })
    expect(formatTripSummary(withUpkeep, calculateTrip(withUpkeep))).toContain(
      'Of which 400 Kč is wear and tear on the car.',
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

describe('when somebody other than the driver paid for something', () => {
  const shared = makeTrip({
    title: 'Weekend run',
    pricing: { mode: 'from-receipts' },
    consumptionPer100Km: 10,
    segments: [makeDrive({ id: 'd1', distanceKm: 100, occupantIds: ['ann', 'bo', 'cy'] })],
    receipts: [
      { id: 'r1', label: 'Fuel', amount: fromMajor(300) },
      { id: 'r2', label: 'Second tank', amount: fromMajor(600), paidBy: 'bo' },
    ],
  })
  const summary = formatTripSummary(shared, calculateTrip(shared))

  it('says what each of them put in, not just the driver', () => {
    expect(summary).toContain('Ann put in 300 Kč')
    expect(summary).toContain('Bo put in 600 Kč')
  })

  it('asks only the people who are actually down to send anything', () => {
    const collect = summary.slice(summary.indexOf('Please send Ann:'), summary.indexOf('Total to collect'))
    // Bo is owed 300 of the 600 they laid out, so Bo is not on this list.
    expect(collect).not.toContain('Bo:')
    expect(collect).toContain('Cy: 300 Kč')
  })

  it('says what the driver has to send back', () => {
    expect(summary).toContain('Ann sends back:')
    expect(summary).toMatch(/^ {2}Bo: 300 Kč$/m)
  })
})
