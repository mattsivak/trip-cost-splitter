import { formatMoney } from '../money/money'
import { formatEnergy } from '../pricing/energyKind'
import { formatEnergyMix } from './energy'
import type { TripResult } from './result'
import type { Trip } from './types'

/**
 * The message that gets pasted into the group chat. Plain text on purpose:
 * it has to survive being copied anywhere.
 */
export function formatTripSummary(trip: Trip, result: TripResult): string {
  const driver = result.people.find((person) => person.isDriver)
  const owed = result.people
    .filter((person) => !person.isDriver && person.payable > 0)
    .sort((a, b) => b.payable - a.payable)

  const lines: string[] = [
    `${trip.title} — fuel split`,
    '',
    `${round1(result.totalDistanceKm)} km · ${formatEnergyMix(result.totalEnergy, trip.streams)} · ${formatMoney(result.totalExact, trip.currency)} total`,
  ]

  // Otherwise the kilowatt-hours sit in the line above with no explanation and
  // somebody reasonably asks why they are not paying for them.
  const free = result.streams.filter((stream) => !stream.billed && stream.quantity > 0)
  if (free.length > 0) {
    const quantities = free.map((stream) => formatEnergy(stream.quantity, stream.kind)).join(' and ')
    lines.push(`The ${quantities} is not being charged to anyone.`)
  }

  if (result.overheadTotal > 0) {
    lines.push(`Of which ${formatMoney(result.overheadTotal, trip.currency)} is tolls, parking and the like.`)
  }

  if (driver) {
    lines.push(`${driver.name} paid up front and covers ${formatMoney(driver.payable, trip.currency)} of it.`)
  }

  lines.push('', `Please send ${driver ? driver.name : 'the driver'}:`)

  if (owed.length === 0) {
    lines.push('  (nothing to collect)')
  } else {
    for (const person of owed) lines.push(`  ${person.name}: ${formatMoney(person.payable, trip.currency)}`)
    lines.push('', `Total to collect: ${formatMoney(result.collectFromOthers, trip.currency)}`)
  }

  if (result.receiptsDelta >= 100) {
    lines.push(
      '',
      `Note: receipts came to ${formatMoney(result.receiptsTotal, trip.currency)}, which is ${formatMoney(result.receiptsDelta, trip.currency)} more than this split covers.`,
    )
  }

  return lines.join('\n')
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
