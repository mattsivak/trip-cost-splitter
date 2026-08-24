import type { Money } from '../money/money'
import type { PersonId, SegmentId } from './types'

export interface SegmentBreakdown {
  segmentId: SegmentId
  label: string
  kind: 'drive' | 'idle'
  energy: number
  energyPerOccupant: number
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
  fuelShare: Money
  overheadShare: Money
  /** Exact amount owed, in minor units. */
  exactTotal: Money
  /** What this person actually hands over, in whole major units. */
  payable: Money
  segmentIds: SegmentId[]
}

export interface TripResult {
  totalEnergy: number
  totalDistanceKm: number
  /** The pot of money being divided for energy. */
  fuelTotal: Money
  /** Implied by the pot and the quantity, whichever pricing mode produced it. */
  derivedPricePerUnit: Money
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
