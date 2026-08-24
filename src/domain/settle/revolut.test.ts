import { describe, expect, it } from 'vitest'
import { buildRevolutLink, normalizeRevolutHandle, paymentNote, revolutProfileUrl } from './revolut'

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
  it('builds the link Revolut expects', () => {
    expect(buildRevolutLink('mattsivak', 12100, 'CZK', 'Janca - trip name')).toBe(
      'https://revolut.me/mattsivak?currency=CZK&amount=12100&note=Janca%20-%20trip%20name',
    )
  })

  it('takes the amount in minor units, as the rest of the domain does', () => {
    // 92300 is 923,00 Kč — the same integer the split produces.
    expect(buildRevolutLink('mattsivak', 92300, 'CZK')).toBe(
      'https://revolut.me/mattsivak?currency=CZK&amount=92300',
    )
  })

  it('upper-cases the currency and tolerates padding', () => {
    expect(buildRevolutLink('mattsivak', 1200, ' eur ')).toBe(
      'https://revolut.me/mattsivak?currency=EUR&amount=1200',
    )
  })

  it('escapes spaces as %20, not as plus', () => {
    const link = buildRevolutLink('mattsivak', 100, 'CZK', 'Anet - Volkswagen August trip')
    expect(link).toContain('note=Anet%20-%20Volkswagen%20August%20trip')
    expect(link).not.toContain('+')
  })

  it('escapes characters that would otherwise break the query', () => {
    const link = buildRevolutLink('mattsivak', 100, 'CZK', 'Anet & co #2 = trip')
    expect(link).toContain('note=Anet%20%26%20co%20%232%20%3D%20trip')
  })

  it('survives a note with diacritics', () => {
    const link = buildRevolutLink('mattsivak', 100, 'CZK', 'Janča - Šumperk')
    expect(link).toContain('note=Jan%C4%8Da%20-%20%C5%A0umperk')
  })

  it('leaves the note out entirely when there is none', () => {
    expect(buildRevolutLink('mattsivak', 100, 'CZK', '   ')).toBe(
      'https://revolut.me/mattsivak?currency=CZK&amount=100',
    )
  })

  it('caps an absurdly long note rather than bloating the link', () => {
    const link = buildRevolutLink('mattsivak', 100, 'CZK', 'x'.repeat(500)) ?? ''
    expect(link.length).toBeLessThan(200)
  })

  it('refuses to build a link it cannot get right', () => {
    // A link asking for the wrong amount is worse than no link at all.
    expect(buildRevolutLink('', 100, 'CZK')).toBeNull()
    expect(buildRevolutLink('x', 100, 'CZK')).toBeNull() // too short to be a handle
    expect(buildRevolutLink('mattsivak', 100, 'Kč')).toBeNull() // a symbol, not a code
    expect(buildRevolutLink('mattsivak', 100, 'czech')).toBeNull()
    expect(buildRevolutLink('mattsivak', 0, 'CZK')).toBeNull()
    expect(buildRevolutLink('mattsivak', -500, 'CZK')).toBeNull()
    expect(buildRevolutLink('mattsivak', Number.NaN, 'CZK')).toBeNull()
    // Minor units are whole numbers; a fraction means somebody passed major units.
    expect(buildRevolutLink('mattsivak', 12.5, 'CZK')).toBeNull()
  })

  it('normalizes a pasted URL before building on it', () => {
    expect(buildRevolutLink('https://revolut.me/mattsivak', 12100, 'CZK')).toBe(
      'https://revolut.me/mattsivak?currency=CZK&amount=12100',
    )
  })
})

describe('paymentNote', () => {
  it('names the person and the trip', () => {
    expect(paymentNote('Janca', 'trip name')).toBe('Janca - trip name')
  })

  it('copes with either half being missing', () => {
    expect(paymentNote('Janca', '')).toBe('Janca')
    expect(paymentNote('', 'trip name')).toBe('trip name')
    expect(paymentNote('  ', '  ')).toBe('')
  })
})

describe('revolutProfileUrl', () => {
  it('gives a plain profile link, for testing the handle', () => {
    expect(revolutProfileUrl('@mattsivak')).toBe('https://revolut.me/mattsivak')
    expect(revolutProfileUrl('nope nope')).toBeNull()
  })
})
