<script setup lang="ts">
import { currencySymbol } from '~/src/domain/money/currency'
import { fromMajor, toMajor } from '~/src/domain/money/money'
import {
  canLookUpPrice,
  ENERGY_KINDS,
  ENERGY_KIND_LABELS,
  isEnergyKind,
  unitLabelFor,
} from '~/src/domain/pricing/energyKind'
import type { Trip } from '~/src/domain/trip/types'

/**
 * What the car runs on and what that costs.
 *
 * Shared between the route step and the split step: the unit belongs next to
 * the consumption figure, and the price belongs next to the receipts, but they
 * are one decision and must not drift apart.
 *
 * A trip priced by the kilometre swaps the whole fuel question for one rate.
 * Wear and tear sits below either way — it is charged per kilometre whatever
 * the driving itself is priced on.
 */
const props = defineProps<{ trip: Trip; showModeNote?: boolean }>()

const unit = computed(() => unitLabelFor(props.trip.energyKind))
const lookingUp = ref(false)
const perKm = computed(() => props.trip.pricing.mode === 'per-km')

const ratePerKmMajor = computed({
  get: () => (props.trip.pricing.mode === 'per-km' ? toMajor(props.trip.pricing.ratePerKm) : 0),
  set: (value: number) => {
    props.trip.pricing = { mode: 'per-km', ratePerKm: fromMajor(value) }
  },
})

const maintenanceMajor = computed({
  get: () => toMajor(props.trip.maintenancePerKm),
  set: (value: number) => {
    props.trip.maintenancePerKm = fromMajor(value)
  },
})

const options = ENERGY_KINDS.map((kind) => ({ kind, label: ENERGY_KIND_LABELS[kind] }))

const priceMajor = computed({
  get: () => (props.trip.pricing.mode === 'fixed-price' ? toMajor(props.trip.pricing.pricePerUnit) : 0),
  set: (value: number) => {
    // A typed-over price is the user's own, so the feed's provenance no longer
    // describes it and is dropped rather than left to mislead.
    props.trip.pricing = { mode: 'fixed-price', pricePerUnit: fromMajor(value) }
  },
})

const source = computed(() =>
  props.trip.pricing.mode === 'fixed-price' ? props.trip.pricing.source : undefined,
)

const provenance = computed(() => {
  const from = source.value
  if (!from) return ''

  const parts = [from.countryName, ENERGY_KIND_LABELS[props.trip.energyKind].toLowerCase()]
  if (from.convertedFromGallons) parts.push('converted from gallons')

  const day = from.fetchedAt ? new Date(from.fetchedAt) : null
  if (day && !Number.isNaN(day.getTime())) {
    parts.push(day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
  }
  return parts.join(' · ')
})

async function changeEnergyKind(value: string) {
  if (!isEnergyKind(value) || value === props.trip.energyKind) return
  props.trip.energyKind = value

  if (props.trip.pricing.mode !== 'fixed-price') return
  if (!canLookUpPrice(value)) {
    props.trip.pricing = { mode: 'fixed-price', pricePerUnit: 0 }
    return
  }

  lookingUp.value = true
  const { price } = await fetchLocalPrice(value)
  lookingUp.value = false
  if (!price || props.trip.pricing.mode !== 'fixed-price') return

  props.trip.pricing = {
    mode: 'fixed-price',
    pricePerUnit: priceToMoney(price),
    source: {
      countryName: price.countryName,
      fetchedAt: price.fetchedAt,
      convertedFromGallons: price.convertedFromGallons,
    },
  }
  props.trip.currency = currencySymbol(price.currency)
  props.trip.currencyCode = price.currency.toUpperCase()
}
</script>

<template>
  <div class="stack stack--tight">
    <div v-if="perKm" class="field-row">
      <label class="field">
        <span>{{ trip.currency }} per km</span>
        <input v-model.number="ratePerKmMajor" type="number" min="0" step="0.1" />
      </label>
      <label class="field">
        <span>{{ trip.currency }} per km, upkeep</span>
        <input v-model.number="maintenanceMajor" type="number" min="0" step="0.1" />
      </label>
    </div>

    <div v-else class="field-row">
      <label class="field">
        <span>Runs on</span>
        <select
          :value="trip.energyKind"
          @change="changeEnergyKind(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in options" :key="option.kind" :value="option.kind">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label v-if="trip.pricing.mode === 'fixed-price'" class="field">
        <span>{{ trip.currency }} per {{ unit }}</span>
        <input v-model.number="priceMajor" type="number" min="0" step="0.1" />
      </label>

      <label class="field">
        <span>{{ trip.currency }} per km, upkeep</span>
        <input v-model.number="maintenanceMajor" type="number" min="0" step="0.1" />
      </label>
    </div>

    <p v-if="perKm" class="hint">
      Charged by the kilometre, so no fuel is counted at all. Upkeep is wear on the car — tyres, servicing,
      the thing itself. Leave it at zero to charge only for the driving.
    </p>
    <p v-else-if="trip.pricing.mode !== 'fixed-price'" class="hint">
      Priced from the receipts, so there is no price to set. Change that in step 4.
    </p>
    <p v-else-if="lookingUp" class="hint">Looking up the local price…</p>
    <p v-else-if="!canLookUpPrice(trip.energyKind)" class="hint">
      Charging prices vary more by where you plug in than by which country you are in — a fast charger is
      often three times the price of charging at home — so this one is left for you to fill in.
    </p>
    <p v-else-if="provenance" class="hint">Local pump price · {{ provenance }}. Edit it if yours differed.</p>
    <p v-else-if="showModeNote" class="hint">Or price the whole trip from the receipts, in step 4.</p>
  </div>
</template>
