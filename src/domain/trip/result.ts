import type { Money } from '../money/money'
import type { PersonId, SegmentId } from './types'

export interface SegmentBreakdown {
  segmentId: SegmentId
  label: string
  kind: 'drive' | 'idle'
  liters: number
  litersPerOccupant: number
  occupantIds: PersonId[]
  cost: Money
  costPerOccupant: Money
  shares: Record<PersonId, Money>
}

export interface PersonBreakdown {
  personId: PersonId
  name: string
  isDriver: boolean
  liters: number
  fuelShare: Money
  overheadShare: Money
  /** Exact amount owed, in minor units. */
  exactTotal: Money
  /** What this person actually hands over, in whole major units. */
  payable: Money
  segmentIds: SegmentId[]
}

export interface TripResult {
  totalLiters: number
  totalDistanceKm: number
  /** The pot of money being divided for fuel. */
  fuelTotal: Money
  /** Implied by the pot and the litres, whichever pricing mode produced it. */
  derivedPricePerLiter: Money
  overheadTotal: Money
  receiptsTotal: Money
  /**
   * Receipts minus the fuel actually charged out. Positive means the driver
   * spent more than the model bills anyone for — money they silently eat.
   * Always zero in `from-receipts` mode.
   */
  receiptsDelta: Money
  totalExact: Money
  totalPayable: Money
  /** Sub-unit difference introduced by rounding to whole major units. */
  roundingResidual: Money
  collectFromOthers: Money
  driverPayable: Money
  segments: SegmentBreakdown[]
  people: PersonBreakdown[]
  warnings: string[]
}
