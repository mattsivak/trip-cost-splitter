<script setup lang="ts">
import { consumptionLabelFor, unitLabelFor } from '~/src/domain/pricing/energyKind'
import type { Trip } from '~/src/domain/trip/types'

/**
 * What the car runs on and what that costs.
 *
 * This lived two screens after the route, and choosing per-kilometre from there
 * silently rewrote it: the consumption fields on every leg disappeared behind
 * you. A decision that changes the shape of the route belongs above the route.
 */
const props = defineProps<{ trip: Trip }>()

function setMode(mode: Trip['pricing']['mode']) {
  if (mode === 'from-receipts') props.trip.pricing = { mode }
  else if (mode === 'per-km') props.trip.pricing = { mode, ratePerKm: 0 }
  else props.trip.pricing = { mode: 'fixed-price', pricePerUnit: 0 }
}
</script>

<template>
  <section class="section" style="margin-top: 0" aria-label="The car">
    <div class="section__head">
      <div>
        <p class="eyebrow">What it runs on</p>
        <h2>The car</h2>
        <p class="section__lede">
          Price the trip from the receipts and the split always adds up to what was really spent. Set a price
          per unit instead and the app tells you what is left over; price it by the kilometre and no fuel is
          counted at all.
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

    <EnergyPrice :trip="trip" show-mode-note />

    <div v-if="trip.pricing.mode !== 'per-km'" class="field-row" style="margin-top: 12px">
      <label class="field">
        <span>Consumption {{ consumptionLabelFor(trip.energyKind) }}</span>
        <input
          v-model.number="trip.consumptionPer100Km"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.1"
        />
      </label>
      <p class="hint">Used for any leg without its own figure.</p>
    </div>
  </section>
</template>
