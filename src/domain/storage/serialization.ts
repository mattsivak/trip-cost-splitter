import type { RoundingMode } from '../money/money'
import { isEnergyKind, type EnergyKind } from '../pricing/energyKind'
import { convertAmount, isCurrencyCode, normalizeCurrencyCode } from '../pricing/fxRates'
import { createId, createTrip } from '../trip/factories'
import type {
  BuyLine,
  LineCharge,
  DistanceSource,
  ForeignAmount,
  OverheadAllocation,
  Person,
  PriceSource,
  Pricing,
  RoutePoint,
  Segment,
  Trip,
  TripLine,
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
    lines: parseLines(value, knownPeople),
    rounding: parseRounding(value.rounding),
    paidAt: parsePaidAt(value.paidAt, knownPeople),
    ...(str(value.currencyCode) ? { currencyCode: str(value.currencyCode).toUpperCase() } : {}),
    ...(str(value.revolutHandle) ? { revolutHandle: str(value.revolutHandle) } : {}),
  }
}

/**
 * The ledger, however it was written down.
 *
 * A trip saved before the ledger existed has three lists — the drives and
 * stops in order, then the fuel receipts, then the tolls — and the order it
 * implies is the order they go in. Nothing is lost and nothing needs
 * converting on disk: the old shape is simply read as the new one.
 */
function parseLines(value: Record<string, unknown>, knownPeople: ReadonlySet<string>): TripLine[] {
  if (Array.isArray(value.lines)) {
    return value.lines.flatMap((line) => parseLine(line, knownPeople))
  }

  return [
    ...asArray(value.segments).flatMap((segment) => parseSegment(segment, knownPeople)),
    ...asArray(value.receipts).flatMap((receipt) => parseBuy(receipt, knownPeople, 'fuel')),
    ...asArray(value.overheadCosts).flatMap((cost) => parseBuy(cost, knownPeople, 'people')),
  ]
}

function parseLine(value: unknown, knownPeople: ReadonlySet<string>): TripLine[] {
  if (!isRecord(value)) return []
  if (value.kind === 'buy') {
    return parseBuy(value, knownPeople, value.funds === 'fuel' ? 'fuel' : 'people')
  }
  return parseSegment(value, knownPeople)
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

  if (value.kind === 'idle' || value.kind === 'stop') {
    const stop: Segment = {
      kind: 'stop',
      id,
      label: str(value.label) || 'Waiting',
      // `liters` is the name trips saved before kWh existed.
      energy: pickNumber(value.energy, value.liters) ?? 0,
      occupantIds,
    }
    const charge = parseCharge(value)
    if (charge) stop.charge = charge
    if (str(value.location)) stop.location = str(value.location)
    if (str(value.notes)) stop.notes = str(value.notes)
    return [stop]
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
  const charge = parseCharge(value)
  if (charge) drive.charge = charge
  return [drive]
}

/**
 * A line priced by hand. `cost` is what a stop's flat price was called before
 * a drive could carry one too.
 */
function parseCharge(value: Record<string, unknown>): LineCharge | null {
  const charge = isRecord(value.charge) ? value.charge : null
  if (charge?.mode === 'per-km') {
    return { mode: 'per-km', ratePerKm: Math.round(Math.max(0, num(charge.ratePerKm, 0))) }
  }
  if (charge?.mode === 'money') {
    return { mode: 'money', amount: Math.round(Math.max(0, num(charge.amount, 0))) }
  }
  const legacy = pickNumber(value.cost)
  return legacy === null ? null : { mode: 'money', amount: Math.round(Math.max(0, legacy)) }
}

/**
 * Money spent, from any of the three shapes it has been stored in: a receipt,
 * an overhead cost, or a ledger line. `funds` is what tells them apart.
 */
function parseBuy(value: unknown, knownPeople: ReadonlySet<string>, funds: 'fuel' | 'people'): BuyLine[] {
  if (!isRecord(value)) return []

  const allocation = isRecord(value.allocation) ? value.allocation : {}
  let parsed: OverheadAllocation = { type: 'even' }

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

  const line: BuyLine = {
    kind: 'buy',
    id: str(value.id) || createId('buy'),
    label: str(value.label) || (funds === 'fuel' ? 'Fuel' : 'Cost'),
    amount: Math.round(num(value.amount, 0)),
    funds,
    allocation: parsed,
  }

  const payer = str(value.paidBy)
  if (payer && knownPeople.has(payer)) line.paidBy = payer
  if (str(value.date)) line.date = str(value.date)
  if (str(value.notes)) line.notes = str(value.notes)

  const foreign = parseForeign(value.foreign)
  if (foreign) {
    line.foreign = foreign
    line.amount = convertAmount(foreign.originalAmount, foreign.rate)
  }

  return [line]
}

/**
 * A foreign amount, or nothing at all.
 *
 * The converted `amount` is never taken from the file. It is recomputed from
 * the original and the rate by the two callers above, so a stored figure that
 * no longer matches its rate — hand-edited, or written by a version that
 * rounded differently — cannot survive a load. The pair is the truth; the
 * conversion is derived from it every time.
 */
function parseForeign(value: unknown): ForeignAmount | undefined {
  if (!isRecord(value)) return undefined

  const currency = str(value.currency)
  if (!isCurrencyCode(currency)) return undefined

  const rate = num(value.rate, 0)
  if (!(rate > 0)) return undefined

  const foreign: ForeignAmount = {
    currency: normalizeCurrencyCode(currency),
    originalAmount: Math.round(num(value.originalAmount, 0)),
    rate,
  }

  const source = isRecord(value.source) ? value.source : null
  const date = source ? str(source.date) : ''
  if (source && date) {
    foreign.source = { date, fetchedAt: str(source.fetchedAt) }
  }

  return foreign
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
