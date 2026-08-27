<script setup lang="ts">
import { formatEnergy, unitLabelFor } from '~/src/domain/pricing/energyKind'
import type { TripResult } from '~/src/domain/trip/result'
import { formatTripSummary } from '~/src/domain/trip/summary'
import type { Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip; result: TripResult }>()

const { exact } = useMoney(() => props.trip.currency)
const copied = ref(false)

const summary = computed(() => formatTripSummary(props.trip, props.result))

function setMode(mode: Trip['pricing']['mode']) {
  if (mode === 'from-receipts') props.trip.pricing = { mode }
  else if (mode === 'per-km') props.trip.pricing = { mode, ratePerKm: 0 }
  else props.trip.pricing = { mode: 'fixed-price', pricePerUnit: 0 }
}

/** What the split was measured from, in the same units the rest of the page uses. */
function basisFor(segmentId: string): string {
  const segment = props.trip.segments.find((entry) => entry.id === segmentId)
  if (!segment) return ''
  // Priced by the kilometre, litres were never counted, so quoting them as
  // the basis of the split would describe a measurement nobody took.
  if (props.trip.pricing.mode === 'per-km') {
    return segment.kind === 'idle' ? 'waiting' : formatKm(segment.distanceKm)
  }
  if (segment.kind === 'idle') return `${formatEnergy(segment.energy, props.trip.energyKind)} parked`
  if (segment.directEnergy !== undefined)
    return `${formatEnergy(segment.directEnergy, props.trip.energyKind)} measured`
  return formatKm(segment.distanceKm)
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
            Receipts are the money that really left somebody's pocket — the driver's unless you say otherwise.
            Price the trip from them and the split always adds up to what was spent; set a price per unit
            instead and the app tells you what is left over.
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
        <label class="toggle" :class="{ 'is-on': trip.pricing.mode === 'per-km' }">
          <input
            type="radio"
            :checked="trip.pricing.mode === 'per-km'"
            :name="`pricing-${trip.id}`"
            @change="setMode('per-km')"
          />
          <span>Set a price per km</span>
        </label>
      </div>

      <EnergyPrice :trip="trip" />

      <ExpenseList :trip="trip" />
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

      <SplitList :trip="trip" :result="result" />
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
              <th>Leg</th>
              <th>What it's split on</th>
              <th class="is-figure">Fuel</th>
              <th class="is-figure">People</th>
              <th class="is-figure">Cost</th>
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
              <td class="is-figure" data-label="What it's split on">{{ basisFor(segment.segmentId) }}</td>
              <td class="is-figure" data-label="Fuel">
                {{ formatBasis(trip, segment.energy, segment.distanceKm) }}
              </td>
              <td class="is-figure" data-label="People">{{ segment.occupantIds.length }}</td>
              <td class="is-figure" data-label="Cost">{{ exact(segment.cost) }}</td>
              <td class="is-figure" data-label="Each">{{ exact(segment.costPerOccupant) }}</td>
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

<style scoped>
/**
 * A receipt or overhead line. Aligned to the top rather than centred, because
 * a foreign amount grows a second line underneath it and everything beside it
 * should stay put when it does.
 */
.entry-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
}

.entry-row__label {
  flex: 1 1 140px;
  min-width: 0;
}

.entry-row__date {
  flex: 0 1 auto;
  max-width: 150px;
}

/**
 * A cost and the control saying who it is for, held together as one block —
 * otherwise "split evenly between Matthew and Janca" reads as a note about
 * whichever line happens to sit under it.
 */
.overhead {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
}

.overhead + .overhead {
  border-top: 1px dotted var(--rule);
  padding-top: 10px;
}

/**
 * Receipts and costs sit side by side while there is room for them. A phone has
 * not got the room: at 390px each column is 175px, and a cost that can say who
 * it is for needs more than that — one name per line is not a list.
 */
@media (max-width: 620px) {
  .field-row--entries {
    grid-template-columns: 1fr;
  }
}
</style>
