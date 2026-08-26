<script setup lang="ts">
import { fromMajor, toMajor } from '~/src/domain/money/money'
import { convertAmount, rateDateFor } from '~/src/domain/pricing/fxRates'
import { paymentCurrencyCode } from '~/src/domain/settle/payment'
import type { OverheadCost, Receipt, Trip } from '~/src/domain/trip/types'

/**
 * One amount of money, in the trip's currency or in somebody else's.
 *
 * Receipts and overheads both carry the same shape, so they share one control
 * rather than two that drift apart. The entry is mutated in place, as
 * everywhere else in the wizard.
 *
 * The rule the whole thing exists to keep: `entry.amount` is *always* the
 * trip's own currency. A foreign amount is converted the moment either half
 * of it changes, so every total elsewhere adds up without knowing any of this
 * happened.
 */
const props = defineProps<{ trip: Trip; entry: Receipt | OverheadCost }>()

const { exact } = useMoney(() => props.trip.currency)

/** Currencies worth offering. The trip's own is handled separately. */
const OFFERED = ['EUR', 'CZK', 'CHF', 'PLN', 'HUF', 'GBP', 'USD', 'SEK', 'NOK', 'DKK', 'RON', 'HRK']

/** Converting needs a code for the trip's own money, not just a symbol. */
const tripCode = computed(() => paymentCurrencyCode(props.trip))

const options = computed(() => {
  const own = tripCode.value
  return own ? [own, ...OFFERED.filter((code) => code !== own)] : OFFERED
})

const currency = computed(() => props.entry.foreign?.currency ?? tripCode.value ?? '')

/** What goes in the amount box: the foreign figure when there is one. */
const amountMajor = computed(() =>
  toMajor(props.entry.foreign ? props.entry.foreign.originalAmount : props.entry.amount),
)

const rate = computed(() => props.entry.foreign?.rate ?? 0)

/** The rate's provenance, until somebody types over it. */
const source = computed(() => props.entry.foreign?.source ?? null)

const looking = ref(false)

/** Recompute the trip-currency figure from whatever the foreign half now says. */
function settle() {
  const foreign = props.entry.foreign
  if (foreign) props.entry.amount = convertAmount(foreign.originalAmount, foreign.rate)
}

function setAmount(value: number) {
  const minor = fromMajor(Number.isFinite(value) ? value : 0)
  if (props.entry.foreign) {
    props.entry.foreign.originalAmount = minor
    settle()
  } else {
    props.entry.amount = minor
  }
}

function setRate(value: number) {
  if (!props.entry.foreign) return
  props.entry.foreign.rate = Number.isFinite(value) && value > 0 ? value : 0
  // Typed over, so it is their number now, not the bank's.
  delete props.entry.foreign.source
  settle()
}

async function setCurrency(code: string) {
  const own = tripCode.value

  if (!code || code === own) {
    // Back to the trip's own money. The converted figure is already correct
    // in that currency, so it simply stops being a conversion.
    delete props.entry.foreign
    return
  }

  props.entry.foreign = {
    currency: code,
    // What was typed keeps its number and changes its meaning: 62,40 was
    // always what the paper said, whatever we thought the paper was in.
    originalAmount: props.entry.foreign?.originalAmount ?? props.entry.amount,
    rate: 0,
  }
  settle()
  await lookUpRate()
}

/** Fetch the rate for the day this amount is dated, and prefill it. */
async function lookUpRate() {
  const foreign = props.entry.foreign
  const own = tripCode.value
  if (!foreign || !own) return

  looking.value = true
  const date = 'date' in props.entry ? props.entry.date : undefined
  const answer = await fetchFxRate(foreign.currency, own, rateDateFor(date, props.trip.createdAt))
  looking.value = false

  // The entry may have been changed or removed while the request was out.
  const current = props.entry.foreign
  if (!current || current.currency !== foreign.currency) return

  if (answer.rate) {
    current.rate = answer.rate.rate
    current.source = { date: answer.rate.date, fetchedAt: answer.rate.fetchedAt }
    settle()
  }
}

/**
 * A receipt's date decides which day's rate applies, so changing it re-asks —
 * but only while the rate is still the feed's. Once somebody has typed their
 * own rate in, a date change must not quietly overwrite it.
 */
watch(
  () => ('date' in props.entry ? props.entry.date : undefined),
  () => {
    if (props.entry.foreign?.source) void lookUpRate()
  },
)

const dayLabel = computed(() => {
  const date = source.value?.date
  if (!date) return ''
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', timeZone: 'UTC' })
})
</script>

<template>
  <div class="amount-field">
    <div class="amount-field__row">
      <input
        :value="amountMajor"
        type="number"
        min="0"
        step="0.01"
        :aria-label="entry.foreign ? `Amount in ${entry.foreign.currency}` : 'Amount'"
        class="amount-field__amount"
        @input="setAmount(Number(($event.target as HTMLInputElement).value))"
      />
      <select
        :value="currency"
        aria-label="Paid in"
        class="amount-field__currency"
        :disabled="!tripCode"
        @change="setCurrency(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="code in options" :key="code" :value="code">{{ code }}</option>
      </select>
    </div>

    <div v-if="entry.foreign" class="amount-field__fx">
      <label class="amount-field__rate">
        <span class="amount-field__rate-label">Rate</span>
        <input
          :value="rate || ''"
          type="number"
          min="0"
          step="0.0001"
          :placeholder="looking ? '…' : '0'"
          :aria-label="`${trip.currency} per ${entry.foreign.currency}`"
          @input="setRate(Number(($event.target as HTMLInputElement).value))"
        />
      </label>

      <span class="amount-field__converted">
        <template v-if="rate > 0">= {{ exact(entry.amount) }}</template>
        <template v-else-if="looking">looking up the rate…</template>
        <em v-else>no rate — not being counted</em>
      </span>

      <span v-if="source" class="amount-field__source">ECB, {{ dayLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.amount-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.amount-field__row {
  display: flex;
  gap: 6px;
}

.amount-field__amount {
  max-width: 130px;
  flex: 1 1 auto;
  min-width: 0;
}

.amount-field__currency {
  flex: 0 0 auto;
  width: 5.5em;
}

.amount-field__fx {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 13px;
  color: var(--muted, #6b7a7d);
}

.amount-field__rate {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.amount-field__rate input {
  width: 7em;
  padding: 3px 6px;
  font-size: 13px;
}

.amount-field__rate-label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
}

.amount-field__converted {
  font-variant-numeric: tabular-nums;
}

.amount-field__converted em {
  font-style: normal;
  color: var(--warning, #9c5a12);
}

.amount-field__source {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.75;
}
</style>
