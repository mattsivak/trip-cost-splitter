import { describe, expect, it } from 'vitest'
import { fromMajor, sumMoney, toMajor } from '../money/money'
import { calculateTrip } from './calculateTrip'
import { makeDrive, makeIdle, makeTrip } from './testing'

describe('fixed-price mode', () => {
  it('charges litres at the stated price', () => {
    const result = calculateTrip(
      makeTrip({
        pricing: { mode: 'fixed-price', pricePerUnit: fromMajor(43) },
        consumptionPer100Km: 10,
        segments: [makeDrive({ distanceKm: 100, occupantIds: ['ann', 'bo'] })],
      }),
    )

    // 100 km at 10 L/100km is 10 L, at 43 Kč = 430 Kč, halved.
    expect(toMajor(result.fuelTotal)).toBe(430)
    expect(toMajor(result.people[0]!.fuelShare)).toBe(215)
    expect(toMajor(result.people[1]!.fuelShare)).toBe(215)
  })

  it('surfaces the gap between receipts and what is charged out', () => {
    const result = calculateTrip(
      makeTrip({
        segments: [makeDrive({ distanceKm: 100, occupantIds: ['ann', 'bo'] })],
        receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(1000) }],
      }),
    )

    expect(toMajor(result.receiptsDelta)).toBe(570)
    expect(result.warnings.some((warning) => warning.includes('driver'))).toBe(true)
  })

  it("warns when no price is set, naming the trip's own unit", () => {
    const result = calculateTrip(
      makeTrip({ pricing: { mode: 'fixed-price', pricePerUnit: 0 }, segments: [makeDrive()] }),
    )
    expect(result.warnings).toContain('Set a price per L.')

    const electric = calculateTrip(
      makeTrip({
        pricing: { mode: 'fixed-price', pricePerUnit: 0 },
        energyKind: 'electric',
        segments: [makeDrive()],
      }),
    )
    expect(electric.warnings).toContain('Set a price per kWh.')
  })
})

describe('from-receipts mode', () => {
  const trip = makeTrip({
    pricing: { mode: 'from-receipts' },
    consumptionPer100Km: 10,
    segments: [
      makeDrive({ id: 'd1', distanceKm: 100, occupantIds: ['ann', 'bo'] }),
      makeDrive({ id: 'd2', distanceKm: 100, occupantIds: ['ann'] }),
    ],
    receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(900) }],
  })

  it('divides exactly the money that was actually spent', () => {
    const result = calculateTrip(trip)
    expect(result.fuelTotal).toBe(fromMajor(900))
    expect(result.receiptsDelta).toBe(0)
  })

  it('derives the price per litre instead of taking it as input', () => {
    const result = calculateTrip(trip)
    // 20 L total for 900 Kč.
    expect(toMajor(result.derivedPricePerUnit)).toBe(45)
  })

  it('splits in proportion to litres burned per person', () => {
    const result = calculateTrip(trip)
    // Ann rode 10 L worth alone plus half of another 10 L; Bo only the half.
    expect(toMajor(result.people[0]!.fuelShare)).toBe(675)
    expect(toMajor(result.people[1]!.fuelShare)).toBe(225)
  })

  it('asks for a receipt when there are none', () => {
    const result = calculateTrip(makeTrip({ pricing: { mode: 'from-receipts' }, segments: [makeDrive()] }))
    expect(result.warnings.some((warning) => warning.includes('receipt'))).toBe(true)
  })
})

describe('reconciliation', () => {
  const awkward = makeTrip({
    pricing: { mode: 'from-receipts' },
    segments: [
      makeDrive({ id: 'd1', distanceKm: 33.3, occupantIds: ['ann', 'bo', 'cy'] }),
      makeDrive({ id: 'd2', distanceKm: 77.7, occupantIds: ['ann', 'cy'] }),
      makeIdle({ id: 'i1', energy: 7, occupantIds: ['bo', 'cy'] }),
    ],
    overheadCosts: [{ id: 'o1', label: 'Tolls', amount: fromMajor(100), allocation: { type: 'even' } }],
    receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(1234.57) }],
  })

  it('never loses a minor unit across people', () => {
    const result = calculateTrip(awkward)
    expect(sumMoney(result.people.map((person) => person.exactTotal))).toBe(result.totalExact)
  })

  it('never loses a minor unit across segments', () => {
    const result = calculateTrip(awkward)
    expect(sumMoney(result.segments.map((segment) => segment.cost))).toBe(result.fuelTotal)
  })

  it('makes the person view and the segment view agree exactly', () => {
    const result = calculateTrip(awkward)
    for (const person of result.people) {
      const fromSegments = sumMoney(result.segments.map((segment) => segment.shares[person.personId] ?? 0))
      expect(fromSegments).toBe(person.fuelShare)
    }
  })

  it('collects exactly what the trip is billed, to the whole unit', () => {
    const result = calculateTrip(awkward)
    expect(result.totalPayable).toBe(result.driverPayable + result.collectFromOthers)
    expect(Math.abs(toMajor(result.roundingResidual))).toBeLessThan(1)
  })

  it('lands the rounding drift on the driver, never a passenger', () => {
    const result = calculateTrip(awkward)
    for (const person of result.people.filter((entry) => !entry.isDriver)) {
      expect(person.payable % 100).toBe(0)
    }
  })

  it('holds across a range of awkward inputs', () => {
    for (let km = 1; km < 400; km += 37) {
      for (const spend of [0.01, 13.37, 999.99, 6893.73]) {
        const result = calculateTrip(
          makeTrip({
            pricing: { mode: 'from-receipts' },
            segments: [
              makeDrive({ id: 'd1', distanceKm: km, occupantIds: ['ann', 'bo', 'cy'] }),
              makeDrive({ id: 'd2', distanceKm: km / 3, occupantIds: ['bo'] }),
            ],
            receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(spend) }],
          }),
        )
        expect(result.fuelTotal).toBe(fromMajor(spend))
        expect(sumMoney(result.people.map((person) => person.exactTotal))).toBe(result.totalExact)
      }
    }
  })
})

describe('edge cases the old model got wrong', () => {
  it('gives an unassigned segment to the driver and says so', () => {
    const result = calculateTrip(makeTrip({ segments: [makeDrive({ occupantIds: [] })] }))
    const ann = result.people[0]!
    expect(ann.fuelShare).toBe(result.fuelTotal)
    // The old code charged the driver but left the segment off their list.
    expect(ann.segmentIds).toEqual(['drive-1'])
    expect(result.warnings.some((warning) => warning.includes('nobody assigned'))).toBe(true)
  })

  it('ignores occupants who have been removed from the trip', () => {
    const result = calculateTrip(makeTrip({ segments: [makeDrive({ occupantIds: ['ann', 'ghost'] })] }))
    expect(result.people[0]!.fuelShare).toBe(result.fuelTotal)
  })

  it('does not double-charge a person listed twice on one segment', () => {
    const result = calculateTrip(makeTrip({ segments: [makeDrive({ occupantIds: ['ann', 'ann', 'bo'] })] }))
    expect(result.segments[0]!.occupantIds).toEqual(['ann', 'bo'])
    expect(result.people[0]!.fuelShare).toBe(result.people[1]!.fuelShare)
  })

  it('warns when there is no driver to collect', () => {
    const result = calculateTrip(makeTrip({ driverId: null, segments: [makeDrive()] }))
    expect(result.warnings.some((warning) => warning.includes('No driver'))).toBe(true)
    expect(result.driverPayable).toBe(0)
  })

  it('handles a trip with nothing in it', () => {
    const result = calculateTrip(makeTrip())
    expect(result.totalExact).toBe(0)
    expect(result.totalPayable).toBe(0)
    expect(result.segments).toEqual([])
  })

  it('counts overhead even when no fuel was used', () => {
    const result = calculateTrip(
      makeTrip({
        overheadCosts: [{ id: 'o1', label: 'Parking', amount: fromMajor(300), allocation: { type: 'even' } }],
      }),
    )
    expect(toMajor(result.overheadTotal)).toBe(300)
    expect(toMajor(result.collectFromOthers)).toBe(200)
  })
})

describe('priced by the kilometre', () => {
  const trip = makeTrip({
    pricing: { mode: 'per-km', ratePerKm: fromMajor(4) },
    segments: [
      makeDrive({ id: 'd1', distanceKm: 100, occupantIds: ['ann', 'bo'] }),
      makeDrive({ id: 'd2', distanceKm: 50, occupantIds: ['ann'] }),
    ],
  })

  it('charges the distance at the stated rate', () => {
    const result = calculateTrip(trip)
    // 150 km at 4 Kč.
    expect(toMajor(result.fuelTotal)).toBe(600)
  })

  it('splits each leg between whoever was in the car for it', () => {
    const result = calculateTrip(trip)
    expect(toMajor(result.people[0]!.fuelShare)).toBe(400)
    expect(toMajor(result.people[1]!.fuelShare)).toBe(200)
  })

  it('counts no fuel at all, rather than reporting a zero litre figure', () => {
    const result = calculateTrip(trip)
    expect(result.totalEnergy).toBe(0)
    expect(result.derivedPricePerUnit).toBe(0)
    expect(result.people[0]!.energy).toBe(0)
  })

  it('ignores the consumption figure the trip still carries', () => {
    const thirsty = calculateTrip({ ...trip, consumptionPer100Km: 99 })
    expect(toMajor(thirsty.fuelTotal)).toBe(600)
  })

  it('charges an idle stop whatever the waiting was said to cost', () => {
    const result = calculateTrip({
      ...trip,
      segments: [makeIdle({ id: 'i1', cost: fromMajor(120), occupantIds: ['ann', 'bo', 'cy'] })],
    })
    expect(toMajor(result.fuelTotal)).toBe(120)
    expect(toMajor(result.people[0]!.fuelShare)).toBe(40)
  })

  it('costs nothing for an idle stop with no amount on it', () => {
    const result = calculateTrip({
      ...trip,
      segments: [makeIdle({ id: 'i1', energy: 10, occupantIds: ['ann'] })],
    })
    expect(result.fuelTotal).toBe(0)
  })

  it('asks for a rate when none is set', () => {
    const result = calculateTrip({
      ...trip,
      pricing: { mode: 'per-km', ratePerKm: 0 },
    })
    expect(result.warnings).toContain('Set a price per km.')
  })

  it('never loses a minor unit', () => {
    const awkward = calculateTrip({
      ...trip,
      pricing: { mode: 'per-km', ratePerKm: fromMajor(3.33) },
      segments: [
        makeDrive({ id: 'd1', distanceKm: 33.3, occupantIds: ['ann', 'bo', 'cy'] }),
        makeDrive({ id: 'd2', distanceKm: 77.7, occupantIds: ['ann', 'cy'] }),
      ],
    })
    expect(sumMoney(awkward.people.map((person) => person.exactTotal))).toBe(awkward.totalExact)
    expect(sumMoney(awkward.segments.map((segment) => segment.cost))).toBe(awkward.totalExact)
  })
})

describe('wear and tear, charged by the kilometre', () => {
  const trip = makeTrip({
    maintenancePerKm: fromMajor(2),
    segments: [makeDrive({ distanceKm: 100, occupantIds: ['ann', 'bo'] })],
  })

  it('adds to the fuel rather than replacing it', () => {
    const result = calculateTrip(trip)
    // 10 L at 43 Kč, plus 100 km at 2 Kč.
    expect(toMajor(result.fuelTotal)).toBe(430)
    expect(toMajor(result.maintenanceTotal)).toBe(200)
    expect(toMajor(result.totalExact)).toBe(630)
  })

  it('lands on each person alongside their fuel', () => {
    const result = calculateTrip(trip)
    expect(toMajor(result.people[0]!.maintenanceShare)).toBe(100)
    expect(toMajor(result.people[0]!.exactTotal)).toBe(315)
  })

  it('is charged on kilometres ridden, not on fuel burned', () => {
    const lopsided = calculateTrip(
      makeTrip({
        maintenancePerKm: fromMajor(1),
        segments: [
          makeDrive({ id: 'd1', distanceKm: 100, consumptionPer100Km: 20, occupantIds: ['ann'] }),
          makeDrive({ id: 'd2', distanceKm: 100, consumptionPer100Km: 5, occupantIds: ['bo'] }),
        ],
      }),
    )

    // Ann burned four times the fuel Bo did over the same distance...
    expect(toMajor(lopsided.people[0]!.fuelShare)).toBe(860)
    expect(toMajor(lopsided.people[1]!.fuelShare)).toBe(215)
    // ...but they put the same wear on the car.
    expect(toMajor(lopsided.people[0]!.maintenanceShare)).toBe(100)
    expect(toMajor(lopsided.people[1]!.maintenanceShare)).toBe(100)
    expect(lopsided.people[0]!.distanceKm).toBe(100)
  })

  it('does not accrue while the car is parked', () => {
    const result = calculateTrip(
      makeTrip({
        maintenancePerKm: fromMajor(2),
        segments: [makeIdle({ energy: 10, occupantIds: ['ann'] })],
      }),
    )
    expect(result.maintenanceTotal).toBe(0)
  })

  it('stays out of the reconciliation against receipts', () => {
    const result = calculateTrip({
      ...trip,
      pricing: { mode: 'from-receipts' },
      receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(430) }],
    })

    // The receipts covered the fuel exactly; the upkeep is charged on top and
    // must not make a reconciled trip look over-billed.
    expect(result.receiptsDelta).toBe(0)
    expect(toMajor(result.maintenanceTotal)).toBe(200)
    expect(toMajor(result.totalExact)).toBe(630)
  })

  it('applies when the trip is priced per kilometre too', () => {
    const result = calculateTrip({
      ...trip,
      pricing: { mode: 'per-km', ratePerKm: fromMajor(4) },
    })
    expect(toMajor(result.fuelTotal)).toBe(400)
    expect(toMajor(result.maintenanceTotal)).toBe(200)
  })

  it('gives an unassigned leg to the driver even when only upkeep is charged', () => {
    const result = calculateTrip(
      makeTrip({
        pricing: { mode: 'fixed-price', pricePerUnit: 0 },
        consumptionPer100Km: 0,
        maintenancePerKm: fromMajor(2),
        segments: [makeDrive({ distanceKm: 100, occupantIds: [] })],
      }),
    )
    expect(result.warnings.some((warning) => warning.includes('nobody assigned'))).toBe(true)
    expect(toMajor(result.people[0]!.maintenanceShare)).toBe(200)
  })
})
