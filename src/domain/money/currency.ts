/**
 * The feed reports currencies as ISO codes. Showing "1 434 CZK" where somebody
 * expects "1 434 Kč" is not wrong, only foreign, so the common ones get their
 * usual symbol and everything else keeps its code.
 */
const SYMBOLS: Record<string, string> = {
  CZK: 'Kč',
  EUR: '€',
  USD: '$',
  GBP: '£',
  PLN: 'zł',
  HUF: 'Ft',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  RON: 'lei',
  BGN: 'лв',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
}

export function currencySymbol(isoCode: string): string {
  const code = isoCode.trim().toUpperCase()
  return SYMBOLS[code] ?? code
}
