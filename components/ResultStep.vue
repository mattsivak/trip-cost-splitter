<script setup lang="ts">
import { formatEnergy, unitLabelFor } from '~/src/domain/pricing/energyKind'
import { fromMajor, toMajor } from '~/src/domain/money/money'
import { createOverhead, createReceipt } from '~/src/domain/trip/factories'
import type { TripResult } from '~/src/domain/trip/result'
import { formatTripSummary } from '~/src/domain/trip/summary'
import type { Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip; result: TripResult }>()

const { money, exact } = useMoney(() => props.trip.currency)
const copied = ref(false)

const summary = computed(() => formatTripSummary(props.trip, props.result))

function setMode(mode: Trip['pricing']['mode']) {
  props.trip.pricing = mode === 'from-receipts' ? { mode } : { mode: 'fixed-price', pricePerUnit: 0 }
}

/** What the split was measured from, in the same units the rest of the page uses. */
function basisFor(segmentId: string): string {
  const segment = props.trip.segments.find((entry) => entry.id === segmentId)
  if (!segment) return ''
  if (segment.kind === 'idle') return `${formatEnergy(segment.energy, props.trip.energyKind)} parked`
  if (segment.directEnergy !== undefined)
    return `${formatEnergy(segment.directEnergy, props.trip.energyKind)} measured`
  return formatKm(segment.distanceKm)
}

function amountOf(item: { amount: number }): number {
  return toMajor(item.amount)
}

function setAmount(item: { amount: number }, value: number) {
  item.amount = fromMajor(value)
}

async function copy() {
  try {
    await navigator.clipboard.writeText(summary.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="stack">
    <section class="section" style="margin-top: 0">
      <div class="section__head">
        <div>
          <p class="eyebrow">Step 4</p>
          <h2>What was actually spent</h2>
          <p class="section__lede">
            Receipts are the money that really left the driver's pocket. Price the trip from them and the
            split always adds up to what was spent; set a price per unit instead and the app tells you what is
            left over.
          </p>
        </div>
      </div>

      <div class="button-row" style="margin-bottom: 16px">
        <label class="toggle" :class="{ 'is-on': trip.pricing.mode === 'from-receipts' }">
          <input
            type="radio"
            :checked="trip.pricing.mode === 'from-receipts'"
            :name="`pricing-${trip.id}`"
            @change="setMode('from-receipts')"
          />
          <span>Price from the receipts</span>
        </label>
        <label class="toggle" :class="{ 'is-on': trip.pricing.mode === 'fixed-price' }">
          <input
            type="radio"
            :checked="trip.pricing.mode === 'fixed-price'"
            :name="`pricing-${trip.id}`"
            @change="setMode('fixed-price')"
          />
          <span>Set a price per {{ unitLabelFor(trip.energyKind) }}</span>
        </label>
      </div>

      <EnergyPrice :trip="trip" />

      <div class="field-row">
        <div class="stack stack--tight">
          <p class="eyebrow">Receipts</p>
          <div v-for="receipt in trip.receipts" :key="receipt.id" class="button-row">
            <input v-model="receipt.label" style="flex: 1" />
            <input
              :value="amountOf(receipt)"
              type="number"
              min="0"
              step="0.01"
              style="max-width: 130px"
              @input="setAmount(receipt, Number(($event.target as HTMLInputElement).value))"
            />
            <button
              type="button"
              class="button--danger"
              @click="trip.receipts = trip.receipts.filter((entry) => entry.id !== receipt.id)"
            >
              Remove
            </button>
          </div>
          <div class="button-row">
            <button type="button" class="button--quiet" @click="trip.receipts.push(createReceipt())">
              Add a receipt
            </button>
          </div>
        </div>

        <div class="stack stack--tight">
          <p class="eyebrow">Tolls, parking and the like</p>
          <div v-for="cost in trip.overheadCosts" :key="cost.id" class="button-row">
            <input v-model="cost.label" style="flex: 1" />
            <input
              :value="amountOf(cost)"
              type="number"
              min="0"
              step="0.01"
              style="max-width: 130px"
              @input="setAmount(cost, Number(($event.target as HTMLInputElement).value))"
            />
            <button
              type="button"
              class="button--danger"
              @click="trip.overheadCosts = trip.overheadCosts.filter((entry) => entry.id !== cost.id)"
            >
              Remove
            </button>
          </div>
          <div class="button-row">
            <button type="button" class="button--quiet" @click="trip.overheadCosts.push(createOverhead())">
              Add a cost
            </button>
          </div>
          <p class="hint">Split evenly between everyone on the trip.</p>
        </div>
      </div>
    </section>

    <WarningList :warnings="result.warnings" />

    <section class="section">
      <div class="section__head">
        <div>
          <p class="eyebrow">Who owes what</p>
          <h2>The split</h2>
        </div>
        <p class="muted">
          Rounded to whole {{ trip.currency }}. The driver carries the difference, so the total collected is
          always the total billed.
        </p>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th class="is-figure">Fuel</th>
              <th class="is-figure">Other</th>
              <th class="is-figure">Exact</th>
              <th class="is-figure">Owes</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="person in result.people"
              :key="person.personId"
              :class="{ 'is-driver': person.isDriver }"
            >
              <td>
                <span class="cell-name">
                  <strong>{{ person.name }}</strong>
                  <small>
                    {{ person.isDriver ? 'driver · ' : ''
                    }}{{ formatEnergy(person.energy, trip.energyKind) }} over
                    {{ person.segmentIds.length }}
                    {{ person.segmentIds.length === 1 ? 'part' : 'parts' }}
                  </small>
                </span>
              </td>
              <td class="is-figure">{{ exact(person.fuelShare) }}</td>
              <td class="is-figure">{{ exact(person.overheadShare) }}</td>
              <td class="is-figure">{{ exact(person.exactTotal) }}</td>
              <td class="is-figure">
                <span class="total">{{ money(person.payable) }}</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="is-figure">{{ exact(result.fuelTotal) }}</td>
              <td class="is-figure">{{ exact(result.overheadTotal) }}</td>
              <td class="is-figure">{{ exact(result.totalExact) }}</td>
              <td class="is-figure">{{ money(result.totalPayable) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section__head">
        <div>
          <p class="eyebrow">Where it came from</p>
          <h2>Part by part</h2>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Basis</th>
              <th class="is-figure">Fuel</th>
              <th class="is-figure">People</th>
              <th class="is-figure">Cost</th>
              <th class="is-figure">Each</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="segment in result.segments" :key="segment.segmentId">
              <td>
                <span class="cell-name">
                  <strong>{{ segment.label }}</strong>
                  <small>{{ segment.kind === 'idle' ? 'idling' : 'drive' }}</small>
                </span>
              </td>
              <td class="is-figure">{{ basisFor(segment.segmentId) }}</td>
              <td class="is-figure">{{ formatEnergy(segment.energy, trip.energyKind) }}</td>
              <td class="is-figure">{{ segment.occupantIds.length }}</td>
              <td class="is-figure">{{ exact(segment.cost) }}</td>
              <td class="is-figure">{{ exact(segment.costPerOccupant) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!result.segments.length" class="hint" style="margin-top: 8px">
        Nothing to show until there are drives on the route.
      </p>
    </section>

    <section class="section">
      <div class="share">
        <div class="share__head">
          <h3>Message for the group chat</h3>
          <button type="button" @click="copy">{{ copied ? 'Copied' : 'Copy message' }}</button>
        </div>
        <pre>{{ summary }}</pre>
      </div>
      <p class="hint" style="margin-top: 8px">
        The share link carries the whole trip in the address itself. Anyone who opens it gets their own
        editable copy; nothing is uploaded anywhere.
      </p>
    </section>
  </div>
</template>
