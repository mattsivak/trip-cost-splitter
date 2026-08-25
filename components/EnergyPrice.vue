<script setup lang="ts">
import { currencySymbol } from '~/src/domain/money/currency'
import { fromMajor, toMajor } from '~/src/domain/money/money'
import {
  canLookUpPrice,
  ENERGY_KINDS,
  ENERGY_KIND_LABELS,
  isEnergyKind,
  unitLabelFor,
  type EnergyKind,
} from '~/src/domain/pricing/energyKind'
import { createStream } from '~/src/domain/trip/factories'
import type { EnergyStream, Trip } from '~/src/domain/trip/types'

/**
 * What the car draws on and what each of those costs.
 *
 * Shared between the route step and the split step: the unit belongs next to
 * the consumption figure, and the price belongs next to the receipts, but they
 * are one decision and must not drift apart.
 *
 * A plain petrol car has one row here and looks exactly as it always did. A
 * plug-in hybrid has two, and the battery charged at home overnight is the one
 * with "Bill it" turned off.
 */
const props = defineProps<{ trip: Trip; showModeNote?: boolean }>()

const lookingUp = ref<string | null>(null)

const options = ENERGY_KINDS.map((kind) => ({ kind, label: ENERGY_KIND_LABELS[kind] }))
const fixedPrice = computed(() => props.trip.pricingMode === 'fixed-price')
const multiple = computed(() => props.trip.streams.length > 1)

function priceMajor(stream: EnergyStream): number {
  return toMajor(stream.pricePerUnit)
}

function setPriceMajor(stream: EnergyStream, value: number) {
  stream.pricePerUnit = fromMajor(value)
  // A typed-over price is the user's own, so the feed's provenance no longer
  // describes it and is dropped rather than left to mislead.
  delete stream.source
}

function provenanceFor(stream: EnergyStream): string {
  const from = stream.source
  if (!from) return ''

  const parts = [from.countryName, ENERGY_KIND_LABELS[stream.kind].toLowerCase()]
  if (from.convertedFromGallons) parts.push('converted from gallons')

  const day = from.fetchedAt ? new Date(from.fetchedAt) : null
  if (day && !Number.isNaN(day.getTime())) {
    parts.push(day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
  }
  return parts.join(' · ')
}

/** The kinds still worth offering, so a hybrid cannot end up petrol and petrol. */
function kindOptions(stream: EnergyStream) {
  const taken = new Set(
    props.trip.streams.filter((other) => other.id !== stream.id).map((other) => other.kind),
  )
  return options.filter((option) => !taken.has(option.kind))
}

const spareKind = computed<EnergyKind | null>(() => {
  const taken = new Set(props.trip.streams.map((stream) => stream.kind))
  // Electric first: adding a second source to a petrol car almost always means
  // a plug-in hybrid, not a second liquid tank.
  if (!taken.has('electric')) return 'electric'
  return ENERGY_KINDS.find((kind) => !taken.has(kind)) ?? null
})

async function addStream() {
  const kind = spareKind.value
  if (!kind) return

  // A second source is usually the home-charged battery, which nobody is
  // being asked to pay for. Billing it is one click away and says something.
  const stream = createStream(kind, { billed: kind !== 'electric' })
  props.trip.streams.push(stream)
  if (canLookUpPrice(kind)) await lookUpPrice(stream)
}

function removeStream(stream: EnergyStream) {
  if (!multiple.value) return
  props.trip.streams = props.trip.streams.filter((other) => other.id !== stream.id)

  // With one source left, an unbilled trip would cost nobody anything and the
  // checkbox that says so is no longer on screen to explain it.
  const survivor = props.trip.streams[0]
  if (survivor) survivor.billed = true
}

async function changeKind(stream: EnergyStream, value: string) {
  if (!isEnergyKind(value) || value === stream.kind) return
  stream.kind = value
  stream.pricePerUnit = 0
  delete stream.source

  if (canLookUpPrice(value)) await lookUpPrice(stream)
}

async function lookUpPrice(stream: EnergyStream) {
  lookingUp.value = stream.id
  const { price } = await fetchLocalPrice(stream.kind)
  lookingUp.value = null

  // The row may have been removed or switched to another kind while we waited.
  if (!price || !props.trip.streams.includes(stream) || stream.kind !== price.energyKind) return

  stream.pricePerUnit = priceToMoney(price)
  stream.source = {
    countryName: price.countryName,
    fetchedAt: price.fetchedAt,
    convertedFromGallons: price.convertedFromGallons,
  }
  props.trip.currency = currencySymbol(price.currency)
  props.trip.currencyCode = price.currency.toUpperCase()
}
</script>

<template>
  <div class="stack stack--tight">
    <div v-for="(stream, index) in trip.streams" :key="stream.id" class="field-row">
      <label class="field">
        <span>{{ index === 0 ? 'Runs on' : 'Also runs on' }}</span>
        <select :value="stream.kind" @change="changeKind(stream, ($event.target as HTMLSelectElement).value)">
          <option v-for="option in kindOptions(stream)" :key="option.kind" :value="option.kind">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label v-if="fixedPrice" class="field">
        <span>{{ trip.currency }} per {{ unitLabelFor(stream.kind) }}</span>
        <input
          :value="priceMajor(stream)"
          type="number"
          min="0"
          step="0.1"
          :disabled="!stream.billed"
          @input="setPriceMajor(stream, Number(($event.target as HTMLInputElement).value))"
        />
      </label>

      <label v-if="multiple" class="toggle" :class="{ 'is-on': stream.billed }">
        <input v-model="stream.billed" type="checkbox" />
        <span>Bill the {{ ENERGY_KIND_LABELS[stream.kind].toLowerCase() }}</span>
      </label>

      <button
        v-if="multiple"
        type="button"
        class="button--danger"
        :aria-label="`Stop counting ${ENERGY_KIND_LABELS[stream.kind].toLowerCase()}`"
        @click="removeStream(stream)"
      >
        Remove
      </button>
    </div>

    <div v-if="spareKind" class="button-row">
      <button type="button" class="button--quiet" @click="addStream">Add another energy source</button>
    </div>

    <p v-if="!fixedPrice" class="hint">
      Priced from the receipts, so there is no price to set. Change that in step 4.
    </p>
    <template v-else>
      <p v-if="lookingUp" class="hint">Looking up the local price…</p>
      <template v-for="stream in trip.streams" :key="stream.id">
        <p v-if="!stream.billed" class="hint">
          The {{ ENERGY_KIND_LABELS[stream.kind].toLowerCase() }} is still counted and still shown — it just
          costs nobody anything.
        </p>
        <p v-else-if="!canLookUpPrice(stream.kind)" class="hint">
          Charging prices vary more by where you plug in than by which country you are in — a fast charger is
          often three times the price of charging at home — so this one is left for you to fill in.
        </p>
        <p v-else-if="provenanceFor(stream)" class="hint">
          Local pump price · {{ provenanceFor(stream) }}. Edit it if yours differed.
        </p>
      </template>
      <p v-if="showModeNote" class="hint">Or price the whole trip from the receipts, in step 4.</p>
    </template>
  </div>
</template>
