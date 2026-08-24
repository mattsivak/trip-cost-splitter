import type { RoundingMode } from '../money/money'
import { createId, createTrip } from '../trip/factories'
import type {
  DistanceSource,
  OverheadCost,
  Person,
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
    defaultConsumptionLPer100Km: num(value.defaultConsumptionLPer100Km, 7),
    driverId,
    people,
    routePoints: asArray(value.routePoints).flatMap(parseRoutePoint),
    segments: asArray(value.segments).flatMap((segment) => parseSegment(segment, knownPeople)),
    overheadCosts: asArray(value.overheadCosts).flatMap((cost) => parseOverhead(cost, knownPeople)),
    receipts: asArray(value.receipts).flatMap(parseReceipt),
    rounding: parseRounding(value.rounding),
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
      liters: num(value.liters, 0),
      occupantIds,
    }
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
  if (Number.isFinite(value.consumptionLPer100Km))
    drive.consumptionLPer100Km = value.consumptionLPer100Km as number
  if (Number.isFinite(value.directLiters)) drive.directLiters = value.directLiters as number
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
  if (isRecord(value) && value.mode === 'fixed-price') {
    return { mode: 'fixed-price', pricePerLiter: Math.round(num(value.pricePerLiter, 0)) }
  }
  return { mode: 'from-receipts' }
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
