import type { EnergyKind } from '../pricing/energyKind'
import type { Money, RoundingMode } from '../money/money'

export type PersonId = string
/** Kept as the name for a line's id where the result still says "segment". */
export type SegmentId = string
export type LineId = string

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

/**
 * A trip is one ordered ledger of lines, in the order things happened: you
 * drove, you waited, you bought a coffee, you drove again. Three separate
 * lists could not say that a toll happened between two drives, and made the
 * user file every expense into one of two forms with different fields.
 */
interface LineBase {
  id: LineId
  label: string
  notes?: string
}

/** A line that people were present for, and so share the cost of. */
interface RiddenLine extends LineBase {
  /** Who was in the car. An empty list means nobody can be billed for it. */
  occupantIds: PersonId[]
}

/**
 * What a drive or a stop costs, when it is not the trip's own pricing.
 *
 * A trip is normally priced one way throughout — fuel at a price per litre, or
 * a rate per kilometre. A single leg can say otherwise: a taxi you paid for
 * outright, a stretch billed at a different rate.
 */
export type LineCharge = { mode: 'money'; amount: Money } | { mode: 'per-km'; ratePerKm: Money }

/** A stretch of driving. Its fuel is derived from distance and consumption. */
export interface DriveLine extends RiddenLine {
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
  /** Priced by hand instead of by the trip's fuel or rate. */
  charge?: LineCharge
}

/**
 * Energy used while parked, idling or waiting. Measured, not derived.
 * For an electric car this is the cabin heating that runs while you wait.
 */
export interface StopLine extends RiddenLine {
  kind: 'stop'
  location?: string
  energy: number
  /**
   * What the waiting cost, for a trip priced per kilometre — where there is
   * no distance to charge against and no price per litre to value fuel with.
   * Kept alongside `energy` rather than replacing it, so switching modes back
   * and forth never discards what was typed.
   */
  charge?: LineCharge
}

/**
 * Drives and stops are the same thing to the splitter: a quantity of energy
 * plus the people who were there for it. Keeping them in one union is what
 * lets the calculator have a single code path.
 */
export type Segment = DriveLine | StopLine

export type OverheadAllocation =
  /** Split evenly. Omitting `personIds` means everyone on the trip. */
  | { type: 'even'; personIds?: PersonId[] }
  /** Explicit per-person amounts, in minor units. */
  | { type: 'fixed'; amounts: Record<PersonId, Money> }

/**
 * Where a prefilled exchange rate came from. Kept so the interface can say
 * which day's rate it used — the ECB publishes on working days only, so a
 * Saturday receipt is converted at Friday's rate and should admit it.
 */
export interface RateSource {
  /** The day the rate is actually for, which may precede the receipt's date. */
  date: string
  fetchedAt: string
}

/**
 * An amount written in a currency that is not the trip's.
 *
 * `originalAmount` is what the paper says and is what the user edits; the
 * entry's own `amount` stays the converted figure in the trip's currency, so
 * every existing sum over receipts or overheads keeps meaning what it did.
 * The two are held together by `parseTrip`, which re-derives the conversion on
 * load rather than trusting a stored number to still match its rate.
 */
export interface ForeignAmount {
  /** ISO code the amount is written in, e.g. 'EUR'. */
  currency: string
  /** What the receipt says, in minor units of `currency`. 6240 is 62,40 €. */
  originalAmount: Money
  /** Trip-currency units per one unit of `currency`. 24.21 is 24,21 Kč to €1. */
  rate: number
  /** Dropped the moment somebody types over the rate — then it is their number. */
  source?: RateSource
}

/**
 * Money somebody spent: a tank of fuel, a toll, parking, a coffee, the
 * apartment. `funds` is the only thing that separates a fuel purchase from a
 * shared one — the first pays for the driving, the second is divided between
 * the people it was for.
 */
export interface BuyLine extends LineBase {
  kind: 'buy'
  /** Always the trip's own currency. Converted from `foreign` when there is one. */
  amount: Money
  funds: 'fuel' | 'people'
  /** Only meaningful when `funds` is 'people'. */
  allocation: OverheadAllocation
  foreign?: ForeignAmount
  /** The day it was paid, which is also the day whose exchange rate applies. */
  date?: string
  /** Who put the money down. Absent means the driver. */
  paidBy?: PersonId
}

/** One row of the ledger, in the order it happened. */
export type TripLine = DriveLine | StopLine | BuyLine

/** A non-fuel cost: tolls, parking, a vignette, a ferry. Legacy, read-only. */
export interface OverheadCost {
  id: string
  label: string
  /** Always the trip's own currency. Converted from `foreign` when there is one. */
  amount: Money
  allocation: OverheadAllocation
  /** Set when the cost was paid in another currency. */
  foreign?: ForeignAmount
  /**
   * The day it was paid, which is also the day whose exchange rate applies.
   * Optional, exactly as on a receipt — the two are the same kind of thing.
   */
  date?: string
  /**
   * Who actually put the money down. Absent means the driver, which is what
   * every trip written before this field existed meant by saying nothing.
   */
  paidBy?: PersonId
}

/** Money that actually left the driver's pocket. The ground truth. */
export interface Receipt {
  id: string
  label: string
  /** Always the trip's own currency. Converted from `foreign` when there is one. */
  amount: Money
  /** Who paid for it. Absent means the driver — see `OverheadCost.paidBy`. */
  paidBy?: PersonId
  date?: string
  notes?: string
  /** Set when the fuel was bought in another currency. */
  foreign?: ForeignAmount
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
  /**
   * The driving is charged by the kilometre and fuel is never counted at all.
   * For a car whose running cost you already know per km, or a trip billed at
   * a standard mileage rate rather than at what the tank actually took.
   */
  | { mode: 'per-km'; ratePerKm: Money }

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
  /**
   * Wear and tear charged by the kilometre — tyres, servicing, the car itself.
   * Applies in every pricing mode and does nothing at zero, which is what a
   * trip that has never heard of it carries.
   *
   * Deliberately not part of `receiptsDelta`: this is not money that left
   * anybody's pocket at a pump, so it must not disturb the promise that
   * `from-receipts` collects exactly what was spent on fuel.
   */
  maintenancePerKm: Money
  /** Exactly one driver, or none. Not a flag on Person, which allowed two. */
  driverId: PersonId | null
  people: Person[]
  routePoints: RoutePoint[]
  /** The whole trip, in order: drives, stops and money, interleaved. */
  lines: TripLine[]
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
