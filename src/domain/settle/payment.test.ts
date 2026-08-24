import { describe, expect, it } from 'vitest'
import { makeTrip } from '../trip/testing'
import { canBuildPaymentLinks, paymentCurrencyCode, paymentLinkFor } from './payment'

describe('paymentCurrencyCode', () => {
  it('uses the stored code when there is one', () => {
    expect(paymentCurrencyCode(makeTrip({ currency: 'Kč', currencyCode: 'czk' }))).toBe('CZK')
  })

  it('falls back to the symbol, which is all a hand-made trip has', () => {
    // A trip created without a price lookup has no currencyCode at all.
    expect(paymentCurrencyCode(makeTrip({ currency: 'Kč' }))).toBe('CZK')
    expect(paymentCurrencyCode(makeTrip({ currency: '€' }))).toBe('EUR')
  })

  it('accepts a currency already written as a code', () => {
    expect(paymentCurrencyCode(makeTrip({ currency: 'sek' }))).toBe('SEK')
  })

  it('gives up rather than guessing at something unrecognisable', () => {
    expect(paymentCurrencyCode(makeTrip({ currency: 'shells' }))).toBeNull()
    expect(paymentCurrencyCode(makeTrip({ currency: '' }))).toBeNull()
  })
})

describe('canBuildPaymentLinks', () => {
  it('is true once there is a handle and a workable currency', () => {
    expect(canBuildPaymentLinks(makeTrip({ currency: 'Kč', revolutHandle: 'mattsivak' }))).toBe(true)
  })

  it('is false without a handle', () => {
    expect(canBuildPaymentLinks(makeTrip({ currency: 'Kč' }))).toBe(false)
  })

  it('is false when the handle is nonsense', () => {
    expect(canBuildPaymentLinks(makeTrip({ currency: 'Kč', revolutHandle: 'not a handle' }))).toBe(false)
  })

  it('is false when the currency cannot be turned into a code', () => {
    expect(canBuildPaymentLinks(makeTrip({ currency: 'shells', revolutHandle: 'mattsivak' }))).toBe(false)
  })

  it('agrees with whether a link can actually be built', () => {
    // The banner promising buttons and the buttons themselves must not disagree.
    for (const trip of [
      makeTrip({ currency: 'Kč', revolutHandle: 'mattsivak' }),
      makeTrip({ currency: 'Kč' }),
      makeTrip({ currency: 'shells', revolutHandle: 'mattsivak' }),
      makeTrip({ currency: '€', currencyCode: 'EUR', revolutHandle: '@matt' }),
    ]) {
      expect(canBuildPaymentLinks(trip)).toBe(paymentLinkFor(trip, 100) !== null)
    }
  })
})

describe('paymentLinkFor', () => {
  it('builds a link for a trip that only ever had a symbol', () => {
    expect(paymentLinkFor(makeTrip({ currency: 'Kč', revolutHandle: 'mattsivak' }), 923)).toBe(
      'https://revolut.me/mattsivak/923czk',
    )
  })

  it('prefers the stored code over the symbol', () => {
    const trip = makeTrip({ currency: 'kr', currencyCode: 'NOK', revolutHandle: 'mattsivak' })
    expect(paymentLinkFor(trip, 50)).toBe('https://revolut.me/mattsivak/50nok')
  })

  it('returns null when there is nothing to build from', () => {
    expect(paymentLinkFor(makeTrip({ currency: 'Kč' }), 100)).toBeNull()
    expect(paymentLinkFor(makeTrip({ currency: 'shells', revolutHandle: 'm' }), 100)).toBeNull()
  })
})
