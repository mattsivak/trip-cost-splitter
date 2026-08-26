import { describe, expect, it } from 'vitest'
import { convertAmount, isCurrencyCode, rateDateFor, selectFxRate } from './fxRates'

/** Shaped exactly like the live api.frankfurter.dev response. */
const feed = {
  amount: 1.0,
  base: 'EUR',
  date: '2026-08-25',
  rates: { CHF: 0.9361, CZK: 24.099, HUF: 362.28, PLN: 4.3055 },
}

describe('selectFxRate', () => {
  it('reads the quote currency out of the map', () => {
    const rate = selectFxRate(feed, 'EUR', 'CZK')
    expect(rate).toMatchObject({ base: 'EUR', quote: 'CZK', rate: 24.099, date: '2026-08-25' })
  })

  it('picks the right one when the feed carries several', () => {
    expect(selectFxRate(feed, 'EUR', 'PLN')?.rate).toBe(4.3055)
  })

  it('accepts lowercase codes and normalises them', () => {
    expect(selectFxRate(feed, 'eur', 'czk')).toMatchObject({ base: 'EUR', quote: 'CZK' })
  })

  it('keeps the day the feed answered with, not the day asked about', () => {
    // The ECB publishes on working days, so a Sunday request comes back Friday.
    const friday = { ...feed, date: '2026-08-21' }
    expect(selectFxRate(friday, 'EUR', 'CZK')?.date).toBe('2026-08-21')
  })

  it('refuses a base the feed did not answer with', () => {
    // Billing against a rate for the wrong currency would be wrong money.
    expect(selectFxRate(feed, 'USD', 'CZK')).toBeNull()
  })

  it('refuses to convert a currency to itself', () => {
    expect(selectFxRate({ ...feed, rates: { EUR: 1 } }, 'EUR', 'EUR')).toBeNull()
  })

  it('returns null for a currency that is not in the map', () => {
    expect(selectFxRate(feed, 'EUR', 'GBP')).toBeNull()
  })

  it.each([
    ['a missing payload', null],
    ['a non-object', 'nope'],
    ['no rates at all', { base: 'EUR', date: '2026-08-25' }],
    ['a zero rate', { base: 'EUR', date: '2026-08-25', rates: { CZK: 0 } }],
    ['a negative rate', { base: 'EUR', date: '2026-08-25', rates: { CZK: -3 } }],
    ['a non-numeric rate', { base: 'EUR', date: '2026-08-25', rates: { CZK: '24' } }],
    ['a missing date', { base: 'EUR', rates: { CZK: 24 } }],
    ['a malformed date', { base: 'EUR', date: 'last tuesday', rates: { CZK: 24 } }],
  ])('returns null for %s', (_case, payload) => {
    expect(selectFxRate(payload, 'EUR', 'CZK')).toBeNull()
  })

  it('rejects anything that is not a three-letter code', () => {
    expect(selectFxRate(feed, 'EURO', 'CZK')).toBeNull()
    expect(selectFxRate(feed, '', 'CZK')).toBeNull()
  })
})

describe('convertAmount', () => {
  it('converts minor units at the given rate', () => {
    // 62,40 € at 24,21 Kč to the euro is 1 510,70 Kč.
    expect(convertAmount(6240, 24.21)).toBe(151070)
  })

  it('rounds to whole minor units, so the result is always exact money', () => {
    expect(Number.isInteger(convertAmount(1234, 24.099))).toBe(true)
    expect(convertAmount(1234, 24.099)).toBe(Math.round(1234 * 24.099))
  })

  it('converts nothing rather than guessing when the rate is unusable', () => {
    expect(convertAmount(6240, 0)).toBe(0)
    expect(convertAmount(6240, -1)).toBe(0)
    expect(convertAmount(6240, Number.NaN)).toBe(0)
  })

  it('leaves zero alone', () => {
    expect(convertAmount(0, 24.099)).toBe(0)
  })
})

describe('rateDateFor', () => {
  it('prefers the entry’s own date', () => {
    expect(rateDateFor('2026-08-14', '2026-08-20')).toBe('2026-08-14')
  })

  it('falls back to the trip’s date when the entry has none', () => {
    expect(rateDateFor(undefined, '2026-08-20')).toBe('2026-08-20')
  })

  it('takes the day out of a full timestamp', () => {
    expect(rateDateFor('2026-08-14T09:30:00.000Z', '2026-08-20')).toBe('2026-08-14')
  })

  it('asks about no particular day when neither is readable', () => {
    expect(rateDateFor('whenever', 'also whenever')).toBeUndefined()
  })
})

describe('isCurrencyCode', () => {
  it('accepts three letters in either case', () => {
    expect(isCurrencyCode('EUR')).toBe(true)
    expect(isCurrencyCode('czk')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isCurrencyCode('Kč')).toBe(false)
    expect(isCurrencyCode('EURO')).toBe(false)
    expect(isCurrencyCode(42)).toBe(false)
    expect(isCurrencyCode(null)).toBe(false)
  })
})
