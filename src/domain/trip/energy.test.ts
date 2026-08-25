import { describe, expect, it } from 'vitest'
import {
  energyForSegment,
  energyMixForSegment,
  formatEnergyMix,
  totalDistanceKm,
  totalEnergy,
  totalEnergyMix,
} from './energy'
import { makeStream, PETROL, VOLTS } from './testing'
import type { DriveSegment, IdleSegment } from './types'

const petrol = makeStream({ consumptionPer100Km: 9.5 })
const volts = makeStream({ kind: 'electric', consumptionPer100Km: 18 })

function drive(overrides: Partial<DriveSegment> = {}): DriveSegment {
  return {
    kind: 'drive',
    id: 'd1',
    label: 'A → B',
    from: 'A',
    to: 'B',
    distanceKm: 100,
    distanceSource: 'manual',
    occupantIds: [],
    ...overrides,
  }
}

function idle(overrides: Partial<IdleSegment> = {}): IdleSegment {
  return { kind: 'idle', id: 'i1', label: 'Waiting', energy: { [PETROL]: 8 }, occupantIds: [], ...overrides }
}

describe('energyForSegment', () => {
  it('derives drive litres from distance and the stream default consumption', () => {
    expect(energyForSegment(drive({ distanceKm: 246.2 }), petrol)).toBeCloseTo(23.389, 3)
  })

  it('prefers a per-segment consumption figure over the stream default', () => {
    const leg = drive({ distanceKm: 100, consumptionPer100Km: { [PETROL]: 12 } })
    expect(energyForSegment(leg, petrol)).toBe(12)
  })

  it('lets a measured litre figure win over the distance calculation', () => {
    const leg = drive({ distanceKm: 100, directEnergy: { [PETROL]: 4 } })
    expect(energyForSegment(leg, petrol)).toBe(4)
  })

  it('uses idle quantities directly', () => {
    expect(energyForSegment(idle({ energy: { [PETROL]: 8.5 } }), petrol)).toBe(8.5)
  })

  it('treats missing, negative and non-finite quantities as zero', () => {
    expect(energyForSegment(drive({ distanceKm: -50 }), petrol)).toBe(0)
    expect(energyForSegment(drive({ distanceKm: Number.NaN }), petrol)).toBe(0)
    expect(energyForSegment(idle({ energy: { [PETROL]: -3 } }), petrol)).toBe(0)
    expect(energyForSegment(idle({ energy: {} }), petrol)).toBe(0)
  })

  it('reads each stream independently, so an override on one leaves the other alone', () => {
    const leg = drive({ distanceKm: 100, consumptionPer100Km: { [PETROL]: 2 } })
    expect(energyForSegment(leg, petrol)).toBe(2)
    expect(energyForSegment(leg, volts)).toBe(18)
  })

  it('lets a measured zero say the engine never ran', () => {
    const leg = drive({ distanceKm: 100, directEnergy: { [PETROL]: 0 } })
    expect(energyForSegment(leg, petrol)).toBe(0)
  })
})

describe('energyMixForSegment', () => {
  it('reports a quantity for every stream, including the untouched ones', () => {
    const leg = drive({ distanceKm: 100, consumptionPer100Km: { [PETROL]: 2, [VOLTS]: 15 } })
    expect(energyMixForSegment(leg, [petrol, volts])).toEqual({ [PETROL]: 2, [VOLTS]: 15 })
  })
})

describe('totals', () => {
  const full = {
    streams: [makeStream({ consumptionPer100Km: 10 })],
    segments: [
      drive({ distanceKm: 100 }),
      drive({ id: 'd2', distanceKm: 50 }),
      idle({ energy: { [PETROL]: 5 } }),
    ],
  }

  it('sums litres across drives and idle stops', () => {
    expect(totalEnergy(full, full.streams[0]!)).toBe(20)
  })

  it('counts only drives toward distance', () => {
    expect(totalDistanceKm(full)).toBe(150)
  })

  it('totals a hybrid trip one stream at a time', () => {
    const hybrid = {
      streams: [makeStream({ consumptionPer100Km: 6 }), volts],
      segments: [
        // The battery half: low petrol, real kilowatt-hours.
        drive({ distanceKm: 200, consumptionPer100Km: { [PETROL]: 2, [VOLTS]: 15 } }),
        // And the rest, on petrol alone.
        drive({ id: 'd2', distanceKm: 240, consumptionPer100Km: { [VOLTS]: 0 } }),
      ],
    }
    expect(totalEnergyMix(hybrid)).toEqual({ [PETROL]: 4 + 14.4, [VOLTS]: 30 })
  })
})

describe('formatEnergyMix', () => {
  it('writes both units when both were used', () => {
    expect(formatEnergyMix({ [PETROL]: 18.4, [VOLTS]: 30 }, [petrol, volts])).toBe('18,4 L + 30,0 kWh')
  })

  it('leaves out a stream that contributed nothing', () => {
    expect(formatEnergyMix({ [PETROL]: 18.4, [VOLTS]: 0 }, [petrol, volts])).toBe('18,4 L')
  })

  it('still reports a zero rather than nothing at all', () => {
    expect(formatEnergyMix({}, [petrol, volts])).toBe('0,0 L')
  })
})
