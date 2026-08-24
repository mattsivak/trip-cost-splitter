import { describe, expect, it } from 'vitest'
import { buildRevolutLink, normalizeRevolutHandle, revolutProfileUrl } from './revolut'

describe('normalizeRevolutHandle', () => {
  it('accepts a bare handle', () => {
    expect(normalizeRevolutHandle('mattsivak')).toBe('mattsivak')
  })

  it('accepts the ways people actually paste it', () => {
    for (const input of [
      '@mattsivak',
      ' mattsivak ',
      'revolut.me/mattsivak',
      'https://revolut.me/mattsivak',
      'https://www.revolut.me/mattsivak',
      'revolut.me/mattsivak/450czk',
      'https://revolut.me/mattsivak?foo=1',
    ]) {
      expect(normalizeRevolutHandle(input)).toBe('mattsivak')
    }
  })

  it('keeps the punctuation Revolut allows', () => {
    expect(normalizeRevolutHandle('matt.sivak_1-x')).toBe('matt.sivak_1-x')
  })

  it('rejects anything that is not a handle', () => {
    for (const bad of ['', '   ', 'a', '@', 'has space', 'emoji🚗', 'x'.repeat(33)]) {
      expect(normalizeRevolutHandle(bad)).toBeNull()
    }
  })
})

describe('buildRevolutLink', () => {
  it('puts the amount and currency in the path', () => {
    expect(buildRevolutLink('mattsivak', 804, 'CZK')).toBe('https://revolut.me/mattsivak/804czk')
  })

  it('lower-cases the currency and tolerates padding', () => {
    expect(buildRevolutLink('mattsivak', 12, ' EuR ')).toBe('https://revolut.me/mattsivak/12eur')
  })

  it('writes whole amounts without decimals', () => {
    expect(buildRevolutLink('mx', 450, 'czk')).toBe('https://revolut.me/mx/450czk')
  })

  it('writes fractional amounts with two decimals', () => {
    expect(buildRevolutLink('mx', 12.5, 'eur')).toBe('https://revolut.me/mx/12.50eur')
    expect(buildRevolutLink('mx', 12.345, 'eur')).toBe('https://revolut.me/mx/12.35eur')
  })

  it('refuses to build a link it cannot get right', () => {
    // A link asking for the wrong amount is worse than no link at all.
    expect(buildRevolutLink('', 10, 'czk')).toBeNull()
    expect(buildRevolutLink('x', 10, 'czk')).toBeNull() // too short to be a handle
    expect(buildRevolutLink('mx', 10, 'Kč')).toBeNull() // a symbol, not an ISO code
    expect(buildRevolutLink('mx', 10, 'czech')).toBeNull()
    expect(buildRevolutLink('mx', 0, 'czk')).toBeNull()
    expect(buildRevolutLink('mx', -5, 'czk')).toBeNull()
    expect(buildRevolutLink('mx', Number.NaN, 'czk')).toBeNull()
  })

  it('normalizes a pasted URL before building on it', () => {
    expect(buildRevolutLink('https://revolut.me/mattsivak/999eur', 804, 'czk')).toBe(
      'https://revolut.me/mattsivak/804czk',
    )
  })
})

describe('revolutProfileUrl', () => {
  it('gives a plain profile link, for testing the handle', () => {
    expect(revolutProfileUrl('@mattsivak')).toBe('https://revolut.me/mattsivak')
    expect(revolutProfileUrl('nope nope')).toBeNull()
  })
})
