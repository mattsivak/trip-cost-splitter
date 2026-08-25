import { describe, expect, it } from 'vitest'
import { fromMajor, sumMoney, toMajor } from '../money/money'
import { calculateTrip } from './calculateTrip'
import { makeDrive, makeIdle, makeStream, makeTrip, PETROL, VOLTS } from './testing'

describe('fixed-price mode', () => {
  it('charges litres at the stated price', () => {
    const result = calculateTrip(
      makeTrip({
        streams: [makeStream({ consumptionPer100Km: 10, pricePerUnit: fromMajor(43) })],
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
      makeTrip({ streams: [makeStream({ pricePerUnit: 0 })], segments: [makeDrive()] }),
    )
    expect(result.warnings).toContain('Set a price per L.')

    const electric = calculateTrip(
      makeTrip({
        streams: [makeStream({ kind: 'electric', pricePerUnit: 0 })],
        segments: [makeDrive()],
      }),
    )
    expect(electric.warnings).toContain('Set a price per kWh.')
  })
})

describe('from-receipts mode', () => {
  const trip = makeTrip({
    pricingMode: 'from-receipts',
    streams: [makeStream({ consumptionPer100Km: 10 })],
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
    expect(toMajor(result.streams[0]!.derivedPricePerUnit)).toBe(45)
  })

  it('splits in proportion to litres burned per person', () => {
    const result = calculateTrip(trip)
    // Ann rode 10 L worth alone plus half of another 10 L; Bo only the half.
    expect(toMajor(result.people[0]!.fuelShare)).toBe(675)
    expect(toMajor(result.people[1]!.fuelShare)).toBe(225)
  })

  it('asks for a receipt when there are none', () => {
    const result = calculateTrip(makeTrip({ pricingMode: 'from-receipts', segments: [makeDrive()] }))
    expect(result.warnings.some((warning) => warning.includes('receipt'))).toBe(true)
  })
})

describe('reconciliation', () => {
  const awkward = makeTrip({
    pricingMode: 'from-receipts',
    segments: [
      makeDrive({ id: 'd1', distanceKm: 33.3, occupantIds: ['ann', 'bo', 'cy'] }),
      makeDrive({ id: 'd2', distanceKm: 77.7, occupantIds: ['ann', 'cy'] }),
      makeIdle({ id: 'i1', energy: { [PETROL]: 7 }, occupantIds: ['bo', 'cy'] }),
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
            pricingMode: 'from-receipts',
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

describe('a hybrid, with the home-charged battery given away', () => {
  // Leave home on a full battery: it carries the first 200 km, during which
  // the engine still sips petrol, then the last 240 km are petrol alone.
  function hybrid(voltsBilled: boolean, voltsPrice = 0) {
    return makeTrip({
      streams: [
        makeStream({ consumptionPer100Km: 6, pricePerUnit: fromMajor(40) }),
        makeStream({
          kind: 'electric',
          consumptionPer100Km: 0,
          pricePerUnit: voltsPrice,
          billed: voltsBilled,
        }),
      ],
      segments: [
        makeDrive({
          id: 'd1',
          distanceKm: 200,
          consumptionPer100Km: { [PETROL]: 2, [VOLTS]: 15 },
          occupantIds: ['ann', 'bo'],
        }),
        makeDrive({ id: 'd2', distanceKm: 240, occupantIds: ['ann', 'bo'] }),
      ],
    })
  }

  it('counts both streams over the same kilometres', () => {
    const result = calculateTrip(hybrid(false))
    // 4 L on the battery half, 14.4 L after it.
    expect(result.totalEnergy[PETROL]).toBeCloseTo(18.4, 6)
    expect(result.totalEnergy[VOLTS]).toBeCloseTo(30, 6)
  })

  it('charges the petrol and nothing at all for the battery', () => {
    const result = calculateTrip(hybrid(false))
    expect(toMajor(result.fuelTotal)).toBe(736)

    const volts = result.streams.find((stream) => stream.streamId === VOLTS)!
    expect(volts.quantity).toBeCloseTo(30, 6)
    expect(volts.cost).toBe(0)
    expect(volts.derivedPricePerUnit).toBe(0)
  })

  it('still says who used the free kilowatt-hours', () => {
    const result = calculateTrip(hybrid(false))
    // Both rode every leg, so the battery splits evenly even though it is free.
    expect(result.people[0]!.energy[VOLTS]).toBeCloseTo(15, 6)
    expect(result.people[1]!.energy[VOLTS]).toBeCloseTo(15, 6)
    expect(result.people[0]!.fuelShare).toBe(result.people[1]!.fuelShare)
  })

  it('does not ask for a price on a stream nobody is billed for', () => {
    const result = calculateTrip(hybrid(false))
    expect(result.warnings.some((warning) => warning.includes('kWh'))).toBe(false)
  })

  it('bills the electricity too once you turn it on', () => {
    const result = calculateTrip(hybrid(true, fromMajor(6.5)))
    // 736 Kč of petrol plus 30 kWh at 6,50 Kč.
    expect(toMajor(result.fuelTotal)).toBe(736 + 195)
  })

  it('keeps the person and segment tables agreeing across both streams', () => {
    const result = calculateTrip(hybrid(true, fromMajor(6.5)))
    expect(sumMoney(result.segments.map((segment) => segment.cost))).toBe(result.fuelTotal)
    for (const person of result.people) {
      const fromSegments = sumMoney(result.segments.map((segment) => segment.shares[person.personId] ?? 0))
      expect(fromSegments).toBe(person.fuelShare)
    }
  })

  it('measures an idle stop against both the tank and the battery', () => {
    const trip = hybrid(false)
    const result = calculateTrip({
      ...trip,
      segments: [makeIdle({ energy: { [PETROL]: 0.4, [VOLTS]: 3.1 }, occupantIds: ['ann'] })],
    })
    expect(result.totalEnergy[PETROL]).toBeCloseTo(0.4, 6)
    expect(result.totalEnergy[VOLTS]).toBeCloseTo(3.1, 6)
    expect(toMajor(result.fuelTotal)).toBe(16)
  })

  it('gives an unassigned leg to the driver when only the battery was drawn on', () => {
    const trip = hybrid(false)
    const result = calculateTrip({
      ...trip,
      segments: [
        makeDrive({
          distanceKm: 100,
          consumptionPer100Km: { [PETROL]: 0, [VOLTS]: 15 },
          occupantIds: [],
        }),
      ],
    })
    expect(result.warnings.some((warning) => warning.includes('nobody assigned'))).toBe(true)
    expect(result.people[0]!.energy[VOLTS]).toBeCloseTo(15, 6)
  })

  it('refuses to guess how one pot of receipts divides between two billed streams', () => {
    const result = calculateTrip({
      ...hybrid(true, fromMajor(6.5)),
      pricingMode: 'from-receipts',
      receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(900) }],
    })

    expect(result.warnings.some((warning) => warning.includes('cannot be split'))).toBe(true)
    // The whole pot still lands on exactly one stream, so collected == spent.
    expect(result.fuelTotal).toBe(fromMajor(900))
  })

  it('prices from receipts happily when only one stream is billed', () => {
    const result = calculateTrip({
      ...hybrid(false),
      pricingMode: 'from-receipts',
      receipts: [{ id: 'r1', label: 'Fuel', amount: fromMajor(900) }],
    })

    expect(result.warnings.some((warning) => warning.includes('cannot be split'))).toBe(false)
    expect(result.fuelTotal).toBe(fromMajor(900))
  })
})
