import type { EnergyKind } from '../pricing/energyKind'
import type { Money, RoundingMode } from '../money/money'

export type PersonId = string
export type SegmentId = string

export interface Person {
  id: PersonId
  name: string
}

export interface RoutePoint {
  id: string
  label: string
  query?: string
  lat?: number
  lon?: number
}

export type DistanceSource = 'manual' | 'osrm' | 'mapy' | 'imported'

interface SegmentBase {
  id: SegmentId
  label: string
  /** Who was in the car. An empty list means nobody can be billed for it. */
  occupantIds: PersonId[]
  notes?: string
}

/** A stretch of driving. Its fuel is derived from distance and consumption. */
export interface DriveSegment extends SegmentBase {
  kind: 'drive'
  from: string
  to: string
  fromPointId?: string
  toPointId?: string
  distanceKm: number
  durationSeconds?: number
  /** Overrides the trip default for this stretch only. */
  consumptionPer100Km?: number
  /** A measured quantity, which wins over the distance calculation. */
  directEnergy?: number
  distanceSource: DistanceSource
  geometry?: string
}

/**
 * Energy used while parked, idling or waiting. Measured, not derived.
 * For an electric car this is the cabin heating that runs while you wait.
 */
export interface IdleSegment extends SegmentBase {
  kind: 'idle'
  location?: string
  energy: number
}

/**
 * Drives and idle stops are the same thing to the splitter: a quantity of
 * energy plus the people who were there for it. Keeping them in one union is
 * what lets the calculator have a single code path.
 */
export type Segment = DriveSegment | IdleSegment

export type OverheadAllocation =
  /** Split evenly. Omitting `personIds` means everyone on the trip. */
  | { type: 'even'; personIds?: PersonId[] }
  /** Explicit per-person amounts, in minor units. */
  | { type: 'fixed'; amounts: Record<PersonId, Money> }

/** A non-fuel cost: tolls, parking, a vignette, a ferry. */
export interface OverheadCost {
  id: string
  label: string
  amount: Money
  allocation: OverheadAllocation
}

/** Money that actually left the driver's pocket. The ground truth. */
export interface Receipt {
  id: string
  label: string
  amount: Money
  date?: string
  notes?: string
}

/**
 * Where a prefilled price came from. Kept so the interface can say so, and
 * dropped the moment somebody types over the price — at which point it is
 * their number, not the feed's.
 */
export interface PriceSource {
  countryName: string
  fetchedAt: string
  convertedFromGallons: boolean
}

export type Pricing =
  /** The user states a price per unit; receipts are only a cross-check. */
  | { mode: 'fixed-price'; pricePerUnit: Money; source?: PriceSource }
  /** The price is whatever the receipts imply. Guarantees collected == spent. */
  | { mode: 'from-receipts' }

export interface Trip {
  id: string
  title: string
  currency: string
  createdAt: string
  updatedAt: string
  pricing: Pricing
  /** What the car runs on. Decides the unit and whether a price can be looked up. */
  energyKind: EnergyKind
  /** Per 100 km, in whatever unit `energyKind` implies. */
  consumptionPer100Km: number
  /** Exactly one driver, or none. Not a flag on Person, which allowed two. */
  driverId: PersonId | null
  people: Person[]
  routePoints: RoutePoint[]
  segments: Segment[]
  overheadCosts: OverheadCost[]
  receipts: Receipt[]
  rounding: RoundingMode
  /**
   * ISO code behind `currency`, when we know it. `currency` is free text for
   * display; this is what a payment link needs.
   */
  currencyCode?: string
  /** Where people should send the money. */
  revolutHandle?: string
  /**
   * Who has settled up, and when. Marked by hand and taken on trust — the app
   * has no way to see a payment actually arrive, and does not pretend to.
   */
  paidAt: Record<PersonId, string>
}
