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
  consumptionLPer100Km?: number
  /** A measured litre figure, which wins over the distance calculation. */
  directLiters?: number
  distanceSource: DistanceSource
  geometry?: string
}

/** Fuel burned while parked, idling or waiting. Measured, not derived. */
export interface IdleSegment extends SegmentBase {
  kind: 'idle'
  location?: string
  liters: number
}

/**
 * Drives and idle stops are the same thing to the splitter: a quantity of
 * fuel plus the people who were there for it. Keeping them in one union is
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

export type Pricing =
  /** The user states a price per litre; receipts are only a cross-check. */
  | { mode: 'fixed-price'; pricePerLiter: Money }
  /** The price is whatever the receipts imply. Guarantees collected == spent. */
  | { mode: 'from-receipts' }

export interface Trip {
  id: string
  title: string
  currency: string
  createdAt: string
  updatedAt: string
  pricing: Pricing
  defaultConsumptionLPer100Km: number
  /** Exactly one driver, or none. Not a flag on Person, which allowed two. */
  driverId: PersonId | null
  people: Person[]
  routePoints: RoutePoint[]
  segments: Segment[]
  overheadCosts: OverheadCost[]
  receipts: Receipt[]
  rounding: RoundingMode
}
