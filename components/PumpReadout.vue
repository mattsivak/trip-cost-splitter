<script setup lang="ts">
import type { TripResult } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip; result: TripResult }>()

const { money, exact } = useMoney(() => props.trip.currency)

const priceNote = computed(() =>
  props.trip.pricing.mode === 'from-receipts' ? 'derived from receipts' : 'set by hand',
)
</script>

<template>
  <section class="readout" aria-label="Trip totals">
    <div class="readout__cell">
      <span class="readout__label">To collect</span>
      <strong class="readout__value">{{ money(result.collectFromOthers) }}</strong>
      <span class="readout__note">{{ result.people.length }} people</span>
    </div>

    <div class="readout__cell">
      <span class="readout__label">Trip total</span>
      <strong class="readout__value">{{ money(result.totalExact) }}</strong>
      <span class="readout__note">{{ formatKm(result.totalDistanceKm) }}</span>
    </div>

    <div class="readout__cell">
      <span class="readout__label">Fuel</span>
      <strong class="readout__value">{{ formatLiters(result.totalLiters) }}</strong>
      <span class="readout__note">{{ exact(result.derivedPricePerLiter) }}/L, {{ priceNote }}</span>
    </div>

    <div class="readout__cell">
      <span class="readout__label">Driver covers</span>
      <strong class="readout__value" :class="{ 'readout__value--muted': result.driverPayable === 0 }">
        {{ money(result.driverPayable) }}
      </strong>
      <span class="readout__note">
        {{ result.people.find((person) => person.isDriver)?.name ?? 'nobody set' }}
      </span>
    </div>
  </section>
</template>
