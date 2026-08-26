import { normalizeCurrencyCode, selectFxRate, type FxRate } from '../../src/domain/pricing/fxRates'

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1'
const TIMEOUT_MS = 4000

/**
 * A rate for a past day is a published fact and never changes, so it is kept
 * for the life of the process. Today's moves once a working day.
 */
const DATED_TTL_MS = Number.POSITIVE_INFINITY
const LATEST_TTL_MS = 6 * 60 * 60 * 1000

/**
 * A failure is remembered only briefly, whatever the day asked about. Holding
 * a dated miss forever would let one dropped request poison that date for the
 * life of the process, and the next lookup would never retry.
 */
const FAILURE_TTL_MS = 60 * 1000

interface Cached {
  at: number
  value: FxRate | null
}

const rates = new Map<string, Cached>()

function fresh(entry: Cached | undefined, ttl: number): entry is Cached {
  if (!entry) return false
  return Date.now() - entry.at < (entry.value ? ttl : FAILURE_TTL_MS)
}

/**
 * The rate to convert `base` into `quote` on a given day.
 *
 * `on` is a calendar day or undefined for the latest. The ECB publishes on
 * working days only; ask about a weekend and the feed answers with the
 * preceding working day, which the returned `date` reports honestly.
 *
 * Never throws. A failed lookup is null, and every caller's fallback is a rate
 * field the user fills in themselves.
 */
export async function rateFor(base: string, quote: string, on?: string): Promise<FxRate | null> {
  const from = normalizeCurrencyCode(base)
  const to = normalizeCurrencyCode(quote)

  // Nothing to look up, and the feed rejects a same-currency request.
  if (from === to) return null

  const day = on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : null
  const key = `${from}:${to}:${day ?? 'latest'}`
  const ttl = day ? DATED_TTL_MS : LATEST_TTL_MS

  const cached = rates.get(key)
  if (fresh(cached, ttl)) return cached.value

  const url = `${FRANKFURTER_URL}/${day ?? 'latest'}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`${url} answered ${response.status}`)

    const rate = selectFxRate(await response.json(), from, to)
    rates.set(key, { at: Date.now(), value: rate })
    return rate
  } catch {
    // Remember the failure briefly so a currency the feed does not carry is
    // not asked about on every keystroke.
    rates.set(key, { at: Date.now(), value: null })
    return null
  }
}
