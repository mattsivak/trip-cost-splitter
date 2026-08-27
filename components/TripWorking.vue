<script setup lang="ts">
import { formatMoney } from '~/src/domain/money/money'
import { formatEnergy, unitLabelFor } from '~/src/domain/pricing/energyKind'
import { describeAllocation } from '~/src/domain/trip/overhead'
import type { TripResult } from '~/src/domain/trip/result'
import type { OverheadCost, Trip } from '~/src/domain/trip/types'

/**
 * The per-part breakdown, read-only.
 *
 * This is what somebody who was handed a payment link reads before paying it.
 * They did not build the trip and were not in the car for all of it, so the
 * order runs from "what was the money" down to "which stretch was mine":
 * the bill, the receipts behind it, each person's share, then part by part.
 */
const props = defineProps<{ trip: Trip; result: TripResult }>()

const { money, exact } = useMoney(() => props.trip.currency)

const unit = computed(() => unitLabelFor(props.trip.energyKind))

/**
 * A total under a single line is the same number written twice. It earns its
 * place only once the bill has parts to add up.
 */
const billHasParts = computed(() => props.result.maintenanceTotal > 0 || props.result.overheadTotal > 0)

/** Dates are optional on a receipt, and a column of dashes is not information. */
const anyReceiptDated = computed(() => props.trip.receipts.some((receipt) => receipt.date))

/**
 * Whose money an entry was. Named only when it was not the driver's: on the
 * ordinary trip every line would otherwise carry the same name, which tells
 * the reader nothing.
 */
function paidByName(entry: { paidBy?: string }): string {
  if (!entry.paidBy || entry.paidBy === props.trip.driverId) return ''
  return props.trip.people.find((person) => person.id === entry.paidBy)?.name ?? ''
}

/** Whether anybody but the driver put money down at all. */
const sharedUpFront = computed(() =>
  props.result.people.some((person) => !person.isDriver && person.fronted > 0),
)

/** What the fuel pot is called depends on whether any fuel was counted. */
const drivingLabel = computed(() => (props.trip.pricing.mode === 'per-km' ? 'Driving' : 'Fuel'))

/** How the pot of money for the driving was arrived at, in one sentence. */
const pricingNote = computed(() => {
  const { trip, result } = props
  const total = exact(result.fuelTotal)

  if (trip.pricing.mode === 'per-km') {
    return `Charged at ${exact(trip.pricing.ratePerKm)} per km over ${formatKm(result.totalDistanceKm)}, which comes to ${total}. No fuel is counted in this mode.`
  }

  const burned = formatEnergy(result.totalEnergy, trip.energyKind)
  const price = `${exact(result.derivedPricePerUnit)} per ${unit.value}`

  if (trip.pricing.mode === 'from-receipts') {
    return `The receipts come to ${exact(result.receiptsTotal)}, and that whole amount is what gets divided. Over the ${burned} the trip burned, that works out at ${price}.`
  }

  return `Fuel is charged at ${price}. The trip burned ${burned}, which comes to ${total}.`
})

/**
 * The gap between what the driver spent and what anyone is billed. Worth
 * spelling out on this page above all: it is money the driver is absorbing,
 * and the reader should see that it is not being passed to them.
 */
const deltaNote = computed(() => {
  const { result } = props
  if (result.receiptsDelta === 0) return ''
  if (result.receiptsDelta > 0) {
    return `The receipts come to ${exact(result.receiptsDelta)} more than that. The driver carries the difference; nobody is billed for it.`
  }
  return `That is ${exact(-result.receiptsDelta)} more than the receipts account for.`
})

/**
 * A receipt's date is stored as an ISO day. Written out, it should read the way
 * the paid-off dates on this same page read.
 */
function dayOf(iso: string | undefined): string {
  if (!iso) return '—'
  const day = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(day.getTime())
    ? iso
    : day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * Who a cost was charged to, when it was not simply everyone. The reader's own
 * name being absent from this line is the whole reason it is here.
 */
function chargedTo(cost: OverheadCost): string {
  const who = describeAllocation(cost, props.trip.people)
  return who === 'everyone' ? '' : `for ${who}`
}

/** Idle stops have no distance; showing a dash is honest, showing 0 km is not. */
function distanceFor(segmentId: string): string {
  const segment = props.trip.segments.find((entry) => entry.id === segmentId)
  return segment?.kind === 'drive' ? formatKm(segment.distanceKm) : '—'
}

function whoWasOn(occupantIds: readonly string[]): string {
  const names = occupantIds
    .map((id) => props.trip.people.find((person) => person.id === id)?.name)
    .filter(Boolean)
  return names.length ? names.join(', ') : 'nobody'
}
</script>

<template>
  <div class="stack">
    <section class="working__part" aria-label="The bill">
      <h3 class="eyebrow">The bill</h3>

      <dl class="bill">
        <div class="bill__line">
          <dt>{{ drivingLabel }}</dt>
          <dd>{{ exact(result.fuelTotal) }}</dd>
        </div>
        <div v-if="result.maintenanceTotal > 0" class="bill__line">
          <dt>
            Wear and tear<small>{{ formatKm(result.totalDistanceKm) }} on the car</small>
          </dt>
          <dd>{{ exact(result.maintenanceTotal) }}</dd>
        </div>
        <div v-if="result.overheadTotal > 0" class="bill__line">
          <dt>Tolls, parking and the like<small>split evenly between everyone</small></dt>
          <dd>{{ exact(result.overheadTotal) }}</dd>
        </div>
        <div v-if="billHasParts" class="bill__line bill__line--total">
          <dt>Total</dt>
          <dd>{{ exact(result.totalExact) }}</dd>
        </div>
      </dl>

      <p class="hint">{{ pricingNote }}</p>
      <p v-if="deltaNote" class="hint">{{ deltaNote }}</p>
    </section>

    <section
      v-if="trip.receipts.length"
      class="working__part"
      :aria-label="sharedUpFront ? 'What was paid up front' : 'What the driver paid'"
    >
      <h3 class="eyebrow">{{ sharedUpFront ? 'What was paid up front' : 'What the driver paid' }}</h3>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th v-if="anyReceiptDated">Date</th>
              <th class="is-figure">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="receipt in trip.receipts" :key="receipt.id">
              <td class="is-rowhead">
                <span class="cell-name">
                  <strong>{{ receipt.label || 'Fuel' }}</strong>
                  <small v-if="paidByName(receipt)">{{ paidByName(receipt) }} paid</small>
                </span>
              </td>
              <td v-if="anyReceiptDated" data-label="Date">{{ dayOf(receipt.date) }}</td>
              <td class="is-figure" data-label="Amount">
                <span class="cell-name">
                  <strong>{{ exact(receipt.amount) }}</strong>
                  <small v-if="receipt.foreign">
                    {{ formatMoney(receipt.foreign.originalAmount, receipt.foreign.currency, 2) }} at
                    {{ receipt.foreign.rate }}
                  </small>
                </span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <!-- The date column has nothing to say about a total, and an
                   empty cell becomes an empty labelled line on a phone. -->
              <td class="is-rowhead" :colspan="anyReceiptDated ? 2 : 1">Receipts in total</td>
              <td class="is-figure" data-label="Amount">{{ exact(result.receiptsTotal) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section v-if="trip.overheadCosts.length" class="working__part" aria-label="Tolls and other costs">
      <h3 class="eyebrow">Tolls and other costs</h3>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cost</th>
              <th class="is-figure">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cost in trip.overheadCosts" :key="cost.id">
              <td class="is-rowhead">
                <span class="cell-name">
                  <strong>{{ cost.label || 'Cost' }}</strong>
                  <small v-if="chargedTo(cost)">{{ chargedTo(cost) }}</small>
                  <small v-if="paidByName(cost)">{{ paidByName(cost) }} paid</small>
                </span>
              </td>
              <td class="is-figure" data-label="Amount">
                <span class="cell-name">
                  <strong>{{ exact(cost.amount) }}</strong>
                  <small v-if="cost.foreign">
                    {{ formatMoney(cost.foreign.originalAmount, cost.foreign.currency, 2) }} at
                    {{ cost.foreign.rate }}
                  </small>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="working__part" aria-label="Your share">
      <h3 class="eyebrow">Your share</h3>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th class="is-figure">Used</th>
              <th v-if="billHasParts" class="is-figure">{{ drivingLabel }}</th>
              <th v-if="result.maintenanceTotal > 0" class="is-figure">Upkeep</th>
              <th v-if="result.overheadTotal > 0" class="is-figure">Other</th>
              <th class="is-figure">Exact</th>
              <th v-if="sharedUpFront" class="is-figure">Paid</th>
              <th class="is-figure">{{ sharedUpFront ? 'Share' : 'Rounded' }}</th>
              <th v-if="sharedUpFront" class="is-figure">Net</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="person in result.people"
              :key="person.personId"
              :class="{ 'is-driver': person.isDriver }"
            >
              <td class="is-rowhead">
                <span class="cell-name">
                  <strong>{{ person.name }}</strong>
                  <small>{{
                    person.isDriver
                      ? sharedUpFront
                        ? 'drove, and collects'
                        : 'drove, and paid up front'
                      : `${person.segmentIds.length} ${person.segmentIds.length === 1 ? 'part' : 'parts'}`
                  }}</small>
                </span>
              </td>
              <td class="is-figure" data-label="Used">
                {{ formatBasis(trip, person.energy, person.distanceKm) }}
              </td>
              <td v-if="billHasParts" class="is-figure" :data-label="drivingLabel">
                {{ exact(person.fuelShare) }}
              </td>
              <td v-if="result.maintenanceTotal > 0" class="is-figure" data-label="Upkeep">
                {{ exact(person.maintenanceShare) }}
              </td>
              <td v-if="result.overheadTotal > 0" class="is-figure" data-label="Other">
                {{ exact(person.overheadShare) }}
              </td>
              <td class="is-figure" data-label="Exact">{{ exact(person.exactTotal) }}</td>
              <td v-if="sharedUpFront" class="is-figure" data-label="Paid">{{ exact(person.fronted) }}</td>
              <td class="is-figure" :data-label="sharedUpFront ? 'Share' : 'Rounded'">
                {{ money(person.payable) }}
              </td>
              <td v-if="sharedUpFront" class="is-figure" data-label="Net">
                <span class="cell-name">
                  <strong>{{ money(Math.abs(person.owes)) }}</strong>
                  <small>{{ person.owes < 0 ? 'owed back' : person.owes > 0 ? 'to pay' : 'settled' }}</small>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="working__part" aria-label="Part by part">
      <h3 class="eyebrow">Part by part</h3>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th class="is-figure">Distance</th>
              <th class="is-figure">Used</th>
              <th>Who was aboard</th>
              <th class="is-figure">Each</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="segment in result.segments" :key="segment.segmentId">
              <td class="is-rowhead">
                <span class="cell-name">
                  <strong>{{ segment.label }}</strong>
                  <small>{{ segment.kind === 'idle' ? 'idling' : 'drive' }}</small>
                </span>
              </td>
              <td class="is-figure" data-label="Distance">{{ distanceFor(segment.segmentId) }}</td>
              <td class="is-figure" data-label="Used">
                {{ formatBasis(trip, segment.energy, segment.distanceKm) }}
              </td>
              <td data-label="Who was aboard">{{ whoWasOn(segment.occupantIds) }}</td>
              <td class="is-figure" data-label="Each">{{ exact(segment.costPerOccupant) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p class="hint">
      Everyone pays for the fuel used on the stretches they were actually in the car for, split evenly between
      whoever was aboard. Amounts are rounded to whole {{ trip.currency }}; the driver carries the difference.
      <template v-if="sharedUpFront">
        Where somebody laid out more than their own share, the net is what actually changes hands — and it
        comes back to them rather than going out.
      </template>
    </p>
  </div>
</template>
