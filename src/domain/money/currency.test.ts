import { describe, expect, it } from 'vitest'
import { currencySymbol } from './currency'

describe('currencySymbol', () => {
  it('gives the common currencies their usual symbol', () => {
    expect(currencySymbol('CZK')).toBe('Kč')
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol('PLN')).toBe('zł')
  })

  it('accepts a lower-case or padded code', () => {
    expect(currencySymbol(' czk ')).toBe('Kč')
  })

  it('keeps the code for anything it does not know', () => {
    expect(currencySymbol('ZAR')).toBe('ZAR')
    expect(currencySymbol('')).toBe('')
  })
})
