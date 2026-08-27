<script setup lang="ts">
import { consumptionLabelFor, unitLabelFor } from '~/src/domain/pricing/energyKind'
import type { Trip } from '~/src/domain/trip/types'

/**
 * How the driving is priced by default. A line can still say otherwise; this
 * is what the ones that say nothing mean.
 */
const props = defineProps<{ trip: Trip }>()

function setMode(mode: Trip['pricing']['mode']) {
  if (mode === 'from-receipts') props.trip.pricing = { mode }
  else if (mode === 'per-km') props.trip.pricing = { mode, ratePerKm: 0 }
  else props.trip.pricing = { mode: 'fixed-price', pricePerUnit: 0 }
}
</script>

<template>
  <div class="pricing">
    <div class="toggles pricing__modes">
      <label class="toggle" :class="{ 'is-on': trip.pricing.mode === 'from-receipts' }">
        <input
          type="radio"
          :checked="trip.pricing.mode === 'from-receipts'"
          :name="`pricing-${trip.id}`"
          @change="setMode('from-receipts')"
        />
        <span>From the receipts</span>
      </label>
      <label class="toggle" :class="{ 'is-on': trip.pricing.mode === 'fixed-price' }">
        <input
          type="radio"
          :checked="trip.pricing.mode === 'fixed-price'"
          :name="`pricing-${trip.id}`"
          @change="setMode('fixed-price')"
        />
        <span>Price per {{ unitLabelFor(trip.energyKind) }}</span>
      </label>
      <label class="toggle" :class="{ 'is-on': trip.pricing.mode === 'per-km' }">
        <input
          type="radio"
          :checked="trip.pricing.mode === 'per-km'"
          :name="`pricing-${trip.id}`"
          @change="setMode('per-km')"
        />
        <span>Rate per km</span>
      </label>
    </div>

    <EnergyPrice :trip="trip" />

    <label v-if="trip.pricing.mode !== 'per-km'" class="field">
      <span>Consumption {{ consumptionLabelFor(trip.energyKind) }}</span>
      <input v-model.number="trip.consumptionPer100Km" type="number" inputmode="decimal" min="0" step="0.1" />
    </label>
  </div>
</template>

<style scoped>
.pricing {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding-bottom: var(--s3);
  margin-bottom: var(--s2);
  border-bottom: 1px solid var(--rule);
}

.pricing__modes {
  margin-bottom: 0;
}

/* The fields the mode asks for, side by side under it. */
.pricing :deep(.field-row) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--s3);
}

.pricing :deep(.field) {
  min-width: 0;
}
</style>
