import type { RoundingMode } from '../money/money'
import { isEnergyKind, type EnergyKind } from '../pricing/energyKind'
import { createId, createStream, createTrip } from '../trip/factories'
import type {
  DistanceSource,
  EnergyStream,
  OverheadCost,
  Person,
  PriceSource,
  PricingMode,
  Receipt,
  RoutePoint,
  Segment,
  StreamId,
  Trip,
} from '../trip/types'

/** What a segment's per-stream figures are read against. */
interface StreamContext {
  known: ReadonlySet<StreamId>
  /** Where a pre-streams trip's single scalar figure lands. */
  primaryId: StreamId
}

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
  const streams = parseStreams(value)
  const streamContext: StreamContext = {
    known: new Set(streams.map((stream) => stream.id)),
    primaryId: streams[0]!.id,
  }

  return {
    ...base,
    id: str(value.id) || base.id,
    title: str(value.title) || 'Untitled trip',
    currency: str(value.currency) || 'Kč',
    createdAt: str(value.createdAt) || base.createdAt,
    updatedAt: str(value.updatedAt) || base.updatedAt,
    pricingMode: parsePricingMode(value),
    streams,
    driverId,
    people,
    routePoints: asArray(value.routePoints).flatMap(parseRoutePoint),
    segments: asArray(value.segments).flatMap((segment) => parseSegment(segment, knownPeople, streamContext)),
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

function parseSegment(value: unknown, knownPeople: ReadonlySet<string>, streams: StreamContext): Segment[] {
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
      // `liters` is the name trips saved before kWh existed, and before that
      // figure became one-per-stream.
      energy: parseMix(value.energy, value.liters, streams) ?? {},
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
  // The second name in each pair is what trips saved before kWh existed.
  const consumption = parseMix(value.consumptionPer100Km, value.consumptionLPer100Km, streams)
  if (consumption !== null) drive.consumptionPer100Km = consumption
  const measured = parseMix(value.directEnergy, value.directLiters, streams)
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

/**
 * The trip-wide pricing mode.
 *
 * Trips saved before the price moved onto each stream carry it as
 * `pricing: { mode }`; newer ones carry it flat.
 */
function parsePricingMode(value: Record<string, unknown>): PricingMode {
  if (value.pricingMode === 'from-receipts') return 'from-receipts'
  if (value.pricingMode === 'fixed-price') return 'fixed-price'
  const legacy = isRecord(value.pricing) ? value.pricing : null
  return legacy?.mode === 'from-receipts' ? 'from-receipts' : 'fixed-price'
}

/**
 * Every energy source on the trip.
 *
 * A trip saved before the car could run on more than one thing has its
 * `energyKind`, its single consumption figure and its single price folded into
 * one stream, which is exactly what it always meant. There is always at least
 * one stream: a trip that draws on nothing cannot be edited back to life.
 */
function parseStreams(value: Record<string, unknown>): EnergyStream[] {
  const listed = asArray(value.streams).flatMap(parseStream)
  if (listed.length > 0) return listed

  const legacyPricing = isRecord(value.pricing) ? value.pricing : {}
  // `pricePerLiter` and `defaultConsumptionLPer100Km` are the names trips
  // saved before the app counted anything but litres.
  const stream = createStream(parseEnergyKind(value.energyKind), {
    consumptionPer100Km: num(value.consumptionPer100Km, num(value.defaultConsumptionLPer100Km, 7)),
    pricePerUnit: Math.round(pickNumber(legacyPricing.pricePerUnit, legacyPricing.pricePerLiter) ?? 0),
    billed: true,
  })

  const source = parsePriceSource(legacyPricing.source)
  return [source ? { ...stream, source } : stream]
}

function parseStream(value: unknown): EnergyStream[] {
  if (!isRecord(value)) return []

  const stream = createStream(parseEnergyKind(value.kind), {
    id: str(value.id) || createId('stream'),
    consumptionPer100Km: num(value.consumptionPer100Km, 0),
    pricePerUnit: Math.round(num(value.pricePerUnit, 0)),
    // Absent means billed: every trip that predates the flag was.
    billed: value.billed !== false,
  })

  const source = parsePriceSource(value.source)
  return [source ? { ...stream, source } : stream]
}

/**
 * A per-stream set of figures, dropping any stream the trip no longer has.
 *
 * `legacy` is the single number the same field held before streams existed;
 * it lands on the primary stream. Returns null when there is nothing to
 * record, so an absent override stays absent rather than becoming an empty
 * object that reads as "explicitly nothing".
 */
function parseMix(value: unknown, legacy: unknown, streams: StreamContext): Record<StreamId, number> | null {
  if (isRecord(value)) {
    const mix: Record<StreamId, number> = {}
    for (const [streamId, quantity] of Object.entries(value)) {
      if (streams.known.has(streamId) && Number.isFinite(quantity)) mix[streamId] = quantity as number
    }
    return Object.keys(mix).length > 0 ? mix : null
  }

  const single = pickNumber(value, legacy)
  return single === null ? null : { [streams.primaryId]: single }
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
