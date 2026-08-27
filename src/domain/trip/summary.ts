import { formatMoney } from '../money/money'
import { formatEnergy } from '../pricing/energyKind'
import type { TripResult } from './result'
import type { Trip } from './types'

/**
 * The message that gets pasted into the group chat. Plain text on purpose:
 * it has to survive being copied anywhere.
 */
export function formatTripSummary(trip: Trip, result: TripResult): string {
  const driver = result.people.find((person) => person.isDriver)

  // Everything is settled through the driver: whoever is down sends them
  // money, and the driver sends money back to anyone who laid out more than
  // their share. Two lists rather than one, because with more than one payer
  // some of the traffic runs the other way.
  const sending = result.people
    .filter((person) => !person.isDriver && person.owes > 0)
    .sort((a, b) => b.owes - a.owes)
  const owedBack = result.people
    .filter((person) => !person.isDriver && person.owes < 0)
    .sort((a, b) => a.owes - b.owes)

  /** More than one person put money down, so "the driver paid" is no longer it. */
  const payers = result.people.filter((person) => person.fronted > 0)
  const sharedUpFront = payers.some((person) => !person.isDriver)

  // Priced per kilometre, no fuel is counted at all, so quoting a litre
  // figure of zero would be a lie dressed up as a measurement.
  const basis =
    trip.pricing.mode === 'per-km'
      ? `${round1(result.totalDistanceKm)} km`
      : `${round1(result.totalDistanceKm)} km · ${formatEnergy(result.totalEnergy, trip.energyKind)}`

  const lines: string[] = [
    `${trip.title} — fuel split`,
    '',
    `${basis} · ${formatMoney(result.totalExact, trip.currency)} total`,
  ]

  if (result.maintenanceTotal > 0) {
    lines.push(`Of which ${formatMoney(result.maintenanceTotal, trip.currency)} is car costs.`)
  }

  if (result.overheadTotal > 0) {
    lines.push(
      `Of which ${formatMoney(result.overheadTotal, trip.currency)} is extras — tolls, parking and the like.`,
    )
  }

  if (sharedUpFront) {
    lines.push(
      payers
        .map((person) => `${person.name} already paid ${formatMoney(person.fronted, trip.currency)}`)
        .join(', ') + '.',
    )
  } else if (driver) {
    lines.push(`${driver.name} paid up front and covers ${formatMoney(driver.payable, trip.currency)} of it.`)
  }

  lines.push('', `Please send ${driver ? driver.name : 'the driver'}:`)

  if (sending.length === 0) {
    lines.push('  (nothing to collect)')
  } else {
    for (const person of sending) lines.push(`  ${person.name}: ${formatMoney(person.owes, trip.currency)}`)
    lines.push(
      '',
      `Total to collect: ${formatMoney(
        sending.reduce((sum, person) => sum + person.owes, 0),
        trip.currency,
      )}`,
    )
  }

  if (owedBack.length > 0 && driver) {
    lines.push('', `${driver.name} sends back:`)
    for (const person of owedBack) lines.push(`  ${person.name}: ${formatMoney(-person.owes, trip.currency)}`)
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
