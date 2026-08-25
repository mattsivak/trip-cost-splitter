<script setup lang="ts">
import { ENERGY_KIND_LABELS, unitLabelFor } from '~/src/domain/pricing/energyKind'
import { formatEnergyMix } from '~/src/domain/trip/energy'
import type { TripResult } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip; result: TripResult }>()

const { money, exact } = useMoney(() => props.trip.currency)

/** "Petrol" for an ordinary car; a hybrid draws on too many things to name one. */
const energyLabel = computed(() =>
  props.trip.streams.length === 1 && props.trip.streams[0]
    ? ENERGY_KIND_LABELS[props.trip.streams[0].kind]
    : 'Energy',
)

const energyValue = computed(() => formatEnergyMix(props.result.totalEnergy, props.trip.streams))

const priceNote = computed(() => {
  const how = props.trip.pricingMode === 'from-receipts' ? 'derived from receipts' : 'set by hand'
  const prices = props.result.streams.map((stream) =>
    stream.billed
      ? `${exact(stream.derivedPricePerUnit)}/${unitLabelFor(stream.kind)}`
      : `${unitLabelFor(stream.kind)} not billed`,
  )
  return `${prices.join(' · ')}, ${how}`
})
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
      <span class="readout__label">{{ energyLabel }}</span>
      <strong class="readout__value" :class="{ 'readout__value--mix': trip.streams.length > 1 }">
        {{ energyValue }}
      </strong>
      <span class="readout__note">{{ priceNote }}</span>
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
