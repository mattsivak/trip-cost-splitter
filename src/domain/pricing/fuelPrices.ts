import { canLookUpPrice, type EnergyKind } from './energyKind'

/**
 * Reading a country's pump price out of the openvan.camp feed.
 *
 * The feed is free and needs no key, but it is somebody else's JSON: every
 * field is treated as optional, and a country we cannot read cleanly comes
 * back as null rather than as a wrong number. A missing prefill is a mild
 * annoyance; a wrong one silently misprices the whole trip.
 */

/** A US liquid gallon. Ten of the 142 countries in the feed quote gallons. */
export const LITERS_PER_US_GALLON = 3.785411784

export interface LocalFuelPrice {
  country: string
  countryName: string
  currency: string
  energyKind: EnergyKind
  /** Major units per litre, e.g. 40.95 for CZK. */
  pricePerUnit: number
  /** True when the source quoted a gallon price and we converted it. */
  convertedFromGallons: boolean
  fetchedAt: string
}

export function selectFuelPrice(
  payload: unknown,
  country: string,
  energyKind: EnergyKind,
): LocalFuelPrice | null {
  // Electricity has no national pump price worth quoting.
  if (!canLookUpPrice(energyKind)) return null

  const code = country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null

  const entry = record(record(payload)?.data)?.[code]
  const country_ = record(entry)
  if (!country_) return null

  // The feed flags entries it does not stand behind.
  if (country_.is_excluded === true) return null

  const quoted = number(record(country_.prices)?.[energyKind])
  if (quoted === null || quoted <= 0) return null

  const currency = text(country_.currency)
  if (!currency) return null

  const perGallon = text(country_.unit).toLowerCase() === 'gallon'
  const perLiter = perGallon ? quoted / LITERS_PER_US_GALLON : quoted

  return {
    country: code,
    countryName: text(country_.country_name) || code,
    currency,
    energyKind,
    pricePerUnit: round2(perLiter),
    convertedFromGallons: perGallon,
    fetchedAt: text(country_.fetched_at),
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
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
