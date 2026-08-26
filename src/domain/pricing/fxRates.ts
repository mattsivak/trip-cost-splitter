import type { Money } from '../money/money'

/**
 * Reading an exchange rate out of the Frankfurter feed.
 *
 * Same posture as the pump price feed: it is free, needs no key, and is
 * somebody else's JSON. Every field is treated as optional and anything we
 * cannot read cleanly comes back as null, because a missing rate is a field
 * the user fills in themselves while a wrong one silently misprices a receipt.
 *
 * The feed carries European Central Bank reference rates, which are published
 * on working days only. Ask about a Saturday and it answers with Friday's rate
 * and says so in `date` — which is why the day it actually used is kept, and
 * shown, rather than the day we asked about.
 */

export interface FxRate {
  /** The foreign currency the amount is written in, e.g. 'EUR'. */
  base: string
  /** The trip's own currency, e.g. 'CZK'. */
  quote: string
  /** Quote units per one base unit. 24.099 means 24,099 Kč to the euro. */
  rate: number
  /** The day this rate is for. May precede the day asked about. */
  date: string
  fetchedAt: string
}

/** ISO 4217 codes are three letters. Anything else cannot be looked up. */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim())
}

export function normalizeCurrencyCode(value: string): string {
  return value.trim().toUpperCase()
}

/**
 * A rate out of one Frankfurter response.
 *
 * The request asks for a single quote currency, but the feed always answers
 * with a map, so the code we want is looked up rather than assumed to be the
 * only one there.
 */
export function selectFxRate(payload: unknown, base: string, quote: string): FxRate | null {
  if (!isCurrencyCode(base) || !isCurrencyCode(quote)) return null

  const from = normalizeCurrencyCode(base)
  const to = normalizeCurrencyCode(quote)

  // Converting a currency to itself is always 1, and the feed rejects it.
  if (from === to) return null

  const body = record(payload)
  if (!body) return null

  // The feed can echo a different base than the one asked for if the request
  // was rewritten. Billing against it would be wrong money, so refuse.
  const answered = text(body.base).toUpperCase()
  if (answered && answered !== from) return null

  const rate = number(record(body.rates)?.[to])
  if (rate === null || rate <= 0) return null

  const date = text(body.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  return { base: from, quote: to, rate, date, fetchedAt: new Date().toISOString() }
}

/**
 * A foreign amount in the trip's own currency.
 *
 * This is the one place a rate — a ratio, and therefore a float — meets money,
 * and it rounds to whole minor units immediately. Everything downstream is
 * integer arithmetic on the result, which is what keeps "collected equals
 * spent" a structural property rather than a hope.
 *
 * A rate that is missing, zero or nonsense converts to nothing rather than to
 * a guess; the calculator warns separately so the money is never lost quietly.
 */
export function convertAmount(originalAmount: Money, rate: number): Money {
  if (!Number.isFinite(originalAmount) || !Number.isFinite(rate) || rate <= 0) return 0
  return Math.round(originalAmount * rate)
}

/** The day to ask about, given what a receipt says. `undefined` means today. */
export function rateDateFor(entryDate: string | undefined, tripDate: string): string | undefined {
  const day = isoDay(entryDate) ?? isoDay(tripDate)
  if (!day) return undefined
  // The feed has no rate for a day that has not happened; asking about one
  // answers with the latest it has, which is what we want anyway.
  return day
}

function isoDay(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match ? (match[1] as string) : null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
