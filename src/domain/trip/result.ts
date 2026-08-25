import type { Money } from '../money/money'
import type { EnergyKind } from '../pricing/energyKind'
import type { EnergyMix } from './energy'
import type { PersonId, SegmentId, StreamId } from './types'

/** What one energy stream came to over the whole trip. */
export interface StreamBreakdown {
  streamId: StreamId
  kind: EnergyKind
  billed: boolean
  quantity: number
  /** Always zero for an unbilled stream — the quantity above still stands. */
  cost: Money
  /** Implied by this stream's pot and quantity, whichever mode produced it. */
  derivedPricePerUnit: Money
}

export interface SegmentBreakdown {
  segmentId: SegmentId
  label: string
  kind: 'drive' | 'idle'
  energy: EnergyMix
  energyPerOccupant: EnergyMix
  occupantIds: PersonId[]
  cost: Money
  costPerOccupant: Money
  shares: Record<PersonId, Money>
}

export interface PersonBreakdown {
  personId: PersonId
  name: string
  isDriver: boolean
  energy: EnergyMix
  fuelShare: Money
  overheadShare: Money
  /** Exact amount owed, in minor units. */
  exactTotal: Money
  /** What this person actually hands over, in whole major units. */
  payable: Money
  segmentIds: SegmentId[]
}

export interface TripResult {
  totalEnergy: EnergyMix
  totalDistanceKm: number
  /** Per-stream quantities and costs, in the trip's own stream order. */
  streams: StreamBreakdown[]
  /** The pot of money being divided for energy, across every billed stream. */
  fuelTotal: Money
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
