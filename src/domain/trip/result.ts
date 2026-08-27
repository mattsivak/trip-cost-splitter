import type { Money } from '../money/money'
import type { PersonId, SegmentId } from './types'

export interface SegmentBreakdown {
  segmentId: SegmentId
  label: string
  kind: 'drive' | 'stop'
  energy: number
  energyPerOccupant: number
  /** Kilometres this segment put on the car. Zero for an idle stop. */
  distanceKm: number
  occupantIds: PersonId[]
  cost: Money
  costPerOccupant: Money
  shares: Record<PersonId, Money>
}

export interface PersonBreakdown {
  personId: PersonId
  name: string
  isDriver: boolean
  energy: number
  /** Kilometres this person was in the car for. What upkeep is charged on. */
  distanceKm: number
  fuelShare: Money
  /** Wear and tear, at the trip's rate per kilometre. Zero unless one is set. */
  maintenanceShare: Money
  overheadShare: Money
  /** Exact amount owed, in minor units. */
  exactTotal: Money
  /** What this person actually hands over, in whole major units. */
  payable: Money
  /** Money this person laid out: their receipts and their overhead costs. */
  fronted: Money
  /**
   * The net position: what they owe less what they fronted. Negative means
   * they are owed money rather than owing it, which is the whole point of
   * recording who paid.
   */
  owes: Money
  segmentIds: SegmentId[]
}

export interface TripResult {
  totalEnergy: number
  totalDistanceKm: number
  /** The pot of money being divided for the driving itself. */
  fuelTotal: Money
  /**
   * Implied by the pot and the quantity, whichever pricing mode produced it.
   * Zero when the trip is priced per kilometre, which counts no fuel at all.
   */
  derivedPricePerUnit: Money
  /** The pot for wear and tear: kilometres driven at the trip's rate. */
  maintenanceTotal: Money
  overheadTotal: Money
  receiptsTotal: Money
  /** Everything anybody laid out: receipts and overhead costs together. */
  frontedTotal: Money
  /**
   * Receipts minus the fuel actually charged out. Positive means the driver
   * spent more than the model bills anyone for — money they silently eat.
   * Always zero in `from-receipts` mode.
   *
   * Compares against the fuel alone. Upkeep is a notional charge rather than
   * a purchase, so counting it here would make a reconciled trip look
   * over-billed.
   */
  receiptsDelta: Money
  totalExact: Money
  totalPayable: Money
  /** Sub-unit difference introduced by rounding to whole major units. */
  roundingResidual: Money
  /**
   * What the driver actually collects: the positive net positions only. Money
   * a passenger laid out is theirs back, not the driver's to gather in.
   */
  collectFromOthers: Money
  /** And what the driver hands back to whoever laid out more than their share. */
  sendBackTotal: Money
  driverPayable: Money
  segments: SegmentBreakdown[]
  people: PersonBreakdown[]
  warnings: string[]
}
