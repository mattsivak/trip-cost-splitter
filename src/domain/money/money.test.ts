import { describe, expect, it } from 'vitest'
import { allocate, formatMoney, fromMajor, roundToMajor, sumMoney, toMajor } from './money'

describe('fromMajor / toMajor', () => {
  it('round-trips a decimal amount without float drift', () => {
    expect(fromMajor(6033.73)).toBe(603373)
    expect(toMajor(603373)).toBe(6033.73)
  })

  it('rounds sub-minor-unit input to the nearest minor unit', () => {
    // 1.005 * 100 is 100.49999999999999 as a float; naive rounding loses a unit.
    expect(fromMajor(1.005)).toBe(101)
    expect(fromMajor(1.004)).toBe(100)
    expect(fromMajor(0.1 + 0.2)).toBe(30)
  })

  it('treats non-finite input as zero', () => {
    expect(fromMajor(Number.NaN)).toBe(0)
    expect(fromMajor(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('accumulates without the classic 0.1 + 0.2 error', () => {
    const amounts = [fromMajor(0.1), fromMajor(0.2)]
    expect(toMajor(sumMoney(amounts))).toBe(0.3)
  })
})

describe('allocate', () => {
  it('sums to exactly the total even when the split is not clean', () => {
    const parts = allocate(100, [1, 1, 1])
    expect(sumMoney(parts)).toBe(100)
    expect(parts).toEqual([34, 33, 33])
  })

  it('distributes proportionally to weights', () => {
    const parts = allocate(1000, [3, 1])
    expect(parts).toEqual([750, 250])
    expect(sumMoney(parts)).toBe(1000)
  })

  it('gives leftover units to the largest remainders first', () => {
    const parts = allocate(10, [1, 1, 1, 1, 1, 1])
    expect(sumMoney(parts)).toBe(10)
    expect(parts).toEqual([2, 2, 2, 2, 1, 1])
  })

  it('spreads evenly when every weight is zero rather than dropping the money', () => {
    const parts = allocate(90, [0, 0, 0])
    expect(sumMoney(parts)).toBe(90)
    expect(parts).toEqual([30, 30, 30])
  })

  it('ignores negative and non-finite weights', () => {
    const parts = allocate(100, [1, -5, Number.NaN, 1])
    expect(sumMoney(parts)).toBe(100)
    expect(parts).toEqual([50, 0, 0, 50])
  })

  it('handles a negative total', () => {
    const parts = allocate(-100, [1, 1, 1])
    expect(sumMoney(parts)).toBe(-100)
  })

  it('returns an empty array for no weights', () => {
    expect(allocate(500, [])).toEqual([])
  })

  it('never loses a unit across many awkward splits', () => {
    for (let total = 0; total < 200; total += 7) {
      for (let people = 1; people <= 9; people += 1) {
        const weights = Array.from({ length: people }, (_, index) => index + 1)
        expect(sumMoney(allocate(total, weights))).toBe(total)
      }
    }
  })
})

describe('roundToMajor', () => {
  it('rounds to whole major units', () => {
    expect(roundToMajor(15012)).toBe(15000)
    expect(roundToMajor(15062)).toBe(15100)
  })

  it('honours up and down modes', () => {
    expect(roundToMajor(15012, 'up')).toBe(15100)
    expect(roundToMajor(15099, 'down')).toBe(15000)
  })
})

describe('formatMoney', () => {
  it('formats whole units by default', () => {
    expect(formatMoney(143400, 'Kč')).toBe('1\u00a0434 Kč')
  })

  it('can show exact minor units', () => {
    expect(formatMoney(143412, 'Kč', 2)).toBe('1\u00a0434,12 Kč')
  })
})
