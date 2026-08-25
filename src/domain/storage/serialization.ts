import type { RoundingMode } from '../money/money'
import { isEnergyKind, type EnergyKind } from '../pricing/energyKind'
import { createId, createTrip } from '../trip/factories'
import type {
  DistanceSource,
  OverheadCost,
  Person,
  PriceSource,
  Pricing,
  Receipt,
  RoutePoint,
  Segment,
  Trip,
} from '../trip/types'

/**
 * Rebuild a Trip from data we did not create: localStorage written by an older
 * version, or a shared URL from anywhere at all.
 *
 * Nothing here throws. Anything unrecognisable is dropped or replaced with a
 * sane default, because a trip that opens with one missing leg beats a blank
 * screen and a stack trace.
 */
export function parseTrip(value: unknown): Trip | null {
  if (!isRecord(value)) return null

  const people = asArray(value.people).flatMap(parsePerson)
  const knownPeople = new Set(people.map((person) => person.id))
  const driverId =
    typeof value.driverId === 'string' && knownPeople.has(value.driverId) ? value.driverId : null

  const base = createTrip()
  return {
    ...base,
    id: str(value.id) || base.id,
    title: str(value.title) || 'Untitled trip',
    currency: str(value.currency) || 'Kč',
    createdAt: str(value.createdAt) || base.createdAt,
    updatedAt: str(value.updatedAt) || base.updatedAt,
    pricing: parsePricing(value.pricing),
    energyKind: parseEnergyKind(value.energyKind),
    // `defaultConsumptionLPer100Km` is what trips saved before the app counted
    // anything but litres called this.
    consumptionPer100Km: num(value.consumptionPer100Km, num(value.defaultConsumptionLPer100Km, 7)),
    // Absent on every trip saved before upkeep could be charged, and zero is
    // exactly what those trips meant.
    maintenancePerKm: Math.round(Math.max(0, num(value.maintenancePerKm, 0))),
    driverId,
    people,
    routePoints: asArray(value.routePoints).flatMap(parseRoutePoint),
    segments: asArray(value.segments).flatMap((segment) => parseSegment(segment, knownPeople)),
    overheadCosts: asArray(value.overheadCosts).flatMap((cost) => parseOverhead(cost, knownPeople)),
    receipts: asArray(value.receipts).flatMap(parseReceipt),
    rounding: parseRounding(value.rounding),
    paidAt: parsePaidAt(value.paidAt, knownPeople),
    ...(str(value.currencyCode) ? { currencyCode: str(value.currencyCode).toUpperCase() } : {}),
    ...(str(value.revolutHandle) ? { revolutHandle: str(value.revolutHandle) } : {}),
  }
}

function parsePerson(value: unknown): Person[] {
  if (!isRecord(value)) return []
  const name = str(value.name)
  if (!name) return []
  return [{ id: str(value.id) || createId('person'), name }]
}

function parseRoutePoint(value: unknown): RoutePoint[] {
  if (!isRecord(value)) return []
  const label = str(value.label)
  if (!label) return []

  const point: RoutePoint = { id: str(value.id) || createId('point'), label }
  if (str(value.query)) point.query = str(value.query)
  if (Number.isFinite(value.lat)) point.lat = value.lat as number
  if (Number.isFinite(value.lon)) point.lon = value.lon as number
  return [point]
}

function parseSegment(value: unknown, knownPeople: ReadonlySet<string>): Segment[] {
  if (!isRecord(value)) return []

  const id = str(value.id) || createId('segment')
  const occupantIds = asArray(value.occupantIds).filter(
    (personId): personId is string => typeof personId === 'string' && knownPeople.has(personId),
  )

  if (value.kind === 'idle') {
    const idle: Segment = {
      kind: 'idle',
      id,
      label: str(value.label) || 'Waiting',
      // `liters` is the name trips saved before kWh existed.
      energy: pickNumber(value.energy, value.liters) ?? 0,
      occupantIds,
    }
    const cost = pickNumber(value.cost)
    if (cost !== null) idle.cost = Math.round(Math.max(0, cost))
    if (str(value.location)) idle.location = str(value.location)
    if (str(value.notes)) idle.notes = str(value.notes)
    return [idle]
  }

  const from = str(value.from)
  const to = str(value.to)
  const drive: Segment = {
    kind: 'drive',
    id,
    label: str(value.label) || `${from || 'Start'} → ${to || 'End'}`,
    from,
    to,
    distanceKm: num(value.distanceKm, 0),
    distanceSource: parseDistanceSource(value.distanceSource),
    occupantIds,
  }
  if (Number.isFinite(value.durationSeconds)) drive.durationSeconds = value.durationSeconds as number
  // The second name in each pair is what trips saved before kWh existed.
  const consumption = pickNumber(value.consumptionPer100Km, value.consumptionLPer100Km)
  if (consumption !== null) drive.consumptionPer100Km = consumption
  const measured = pickNumber(value.directEnergy, value.directLiters)
  if (measured !== null) drive.directEnergy = measured
  if (str(value.notes)) drive.notes = str(value.notes)
  return [drive]
}

function parseOverhead(value: unknown, knownPeople: ReadonlySet<string>): OverheadCost[] {
  if (!isRecord(value)) return []

  const allocation = isRecord(value.allocation) ? value.allocation : {}
  let parsed: OverheadCost['allocation'] = { type: 'even' }

  if (allocation.type === 'fixed') {
    const amounts: Record<string, number> = {}
    for (const [personId, amount] of Object.entries(isRecord(allocation.amounts) ? allocation.amounts : {})) {
      if (knownPeople.has(personId) && Number.isFinite(amount))
        amounts[personId] = Math.round(amount as number)
    }
    parsed = { type: 'fixed', amounts }
  } else if (Array.isArray(allocation.personIds)) {
    parsed = {
      type: 'even',
      personIds: allocation.personIds.filter(
        (personId): personId is string => typeof personId === 'string' && knownPeople.has(personId),
      ),
    }
  }

  return [
    {
      id: str(value.id) || createId('overhead'),
      label: str(value.label) || 'Other cost',
      amount: Math.round(num(value.amount, 0)),
      allocation: parsed,
    },
  ]
}

function parseReceipt(value: unknown): Receipt[] {
  if (!isRecord(value)) return []
  const receipt: Receipt = {
    id: str(value.id) || createId('receipt'),
    label: str(value.label) || 'Receipt',
    amount: Math.round(num(value.amount, 0)),
  }
  if (str(value.date)) receipt.date = str(value.date)
  if (str(value.notes)) receipt.notes = str(value.notes)
  return [receipt]
}

function parsePricing(value: unknown): Pricing {
  if (isRecord(value) && value.mode === 'from-receipts') return { mode: 'from-receipts' }
  if (isRecord(value) && value.mode === 'per-km') {
    return { mode: 'per-km', ratePerKm: Math.round(Math.max(0, num(value.ratePerKm, 0))) }
  }

  // `pricePerLiter` is the name trips saved before kWh existed.
  const price = isRecord(value) ? (pickNumber(value.pricePerUnit, value.pricePerLiter) ?? 0) : 0
  const pricing: Pricing = { mode: 'fixed-price', pricePerUnit: Math.round(price) }

  const source = parsePriceSource(isRecord(value) ? value.source : null)
  return source ? { ...pricing, source } : pricing
}

function parsePaidAt(value: unknown, knownPeople: ReadonlySet<string>): Record<string, string> {
  if (!isRecord(value)) return {}

  const paid: Record<string, string> = {}
  for (const [personId, at] of Object.entries(value)) {
    if (knownPeople.has(personId) && str(at)) paid[personId] = str(at)
  }
  return paid
}

function parsePriceSource(value: unknown): PriceSource | null {
  if (!isRecord(value)) return null
  const countryName = str(value.countryName)
  if (!countryName) return null
  return {
    countryName,
    fetchedAt: str(value.fetchedAt),
    convertedFromGallons: value.convertedFromGallons === true,
  }
}

function parseEnergyKind(value: unknown): EnergyKind {
  return isEnergyKind(value) ? value : 'gasoline'
}

/** First of the two field names that holds a usable number. */
function pickNumber(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
  }
  return null
}

function parseRounding(value: unknown): RoundingMode {
  return value === 'up' || value === 'down' ? value : 'nearest'
}

function parseDistanceSource(value: unknown): DistanceSource {
  return value === 'osrm' || value === 'mapy' || value === 'imported' ? value : 'manual'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
