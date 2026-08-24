import { describe, expect, it } from 'vitest'
import {
  canLookUpPrice,
  consumptionLabelFor,
  ENERGY_KINDS,
  formatEnergy,
  isEnergyKind,
  unitFor,
  unitLabelFor,
} from './energyKind'

describe('units follow the energy kind', () => {
  it('measures liquid fuels in litres', () => {
    for (const kind of ['gasoline', 'diesel', 'lpg'] as const) {
      expect(unitFor(kind)).toBe('liter')
      expect(unitLabelFor(kind)).toBe('L')
    }
  })

  it('measures electricity in kWh', () => {
    expect(unitFor('electric')).toBe('kwh')
    expect(unitLabelFor('electric')).toBe('kWh')
  })

  it('writes consumption in the matching unit', () => {
    expect(consumptionLabelFor('diesel')).toBe('L/100 km')
    expect(consumptionLabelFor('electric')).toBe('kWh/100 km')
  })
})

describe('formatEnergy', () => {
  it('labels a quantity with the right unit', () => {
    expect(formatEnergy(95.3635, 'gasoline')).toBe('95,4 L')
    expect(formatEnergy(38.25, 'electric')).toBe('38,3 kWh')
  })

  it('always shows one decimal, so figures line up', () => {
    expect(formatEnergy(20, 'diesel')).toBe('20,0 L')
  })
})

describe('isEnergyKind', () => {
  it('accepts every kind the app offers', () => {
    for (const kind of ENERGY_KINDS) expect(isEnergyKind(kind)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isEnergyKind('hydrogen')).toBe(false)
    expect(isEnergyKind(undefined)).toBe(false)
    expect(isEnergyKind(7)).toBe(false)
  })
})

describe('canLookUpPrice', () => {
  it('is true for pump fuels, which have a national price', () => {
    expect(canLookUpPrice('gasoline')).toBe(true)
    expect(canLookUpPrice('lpg')).toBe(true)
  })

  it('is false for electricity, where the country tells you almost nothing', () => {
    expect(canLookUpPrice('electric')).toBe(false)
  })
})
