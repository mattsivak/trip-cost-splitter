<script setup lang="ts">
import { canBuildPaymentLinks, paymentCurrencyCode, paymentLinkFor } from '~/src/domain/settle/payment'
import { normalizeRevolutHandle, paymentNote } from '~/src/domain/settle/revolut'
import type { PersonBreakdown } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

/**
 * The one sentence the person holding the phone came for.
 *
 * They opened a link in a group chat. They want their amount, a way to pay it,
 * and — only then — why. Everybody else's amounts are somebody else's business
 * and go behind a fold.
 */
const props = defineProps<{ trip: Trip; person: PersonBreakdown; busy?: boolean }>()

const emit = defineEmits<{ togglePaid: [personId: string, paid: boolean] }>()

const { money } = useMoney(() => props.trip.currency)

const owes = computed(() => props.person.owes)

const headline = computed(() =>
  owes.value > 0
    ? `${props.person.name}, you owe ${money(owes.value)}`
    : owes.value < 0
      ? `${props.person.name}, you are owed ${money(-owes.value)}`
      : `${props.person.name}, you are settled up`,
)

const driver = computed(() => props.trip.people.find((person) => person.id === props.trip.driverId))

const handle = computed(() =>
  props.trip.revolutHandle ? normalizeRevolutHandle(props.trip.revolutHandle) : null,
)

const payLink = computed(() =>
  owes.value > 0 && canBuildPaymentLinks(props.trip)
    ? paymentLinkFor(props.trip, owes.value, paymentNote(props.person.name, props.trip.title))
    : null,
)

const paidAt = computed(() => props.trip.paidAt[props.person.personId] ?? '')
</script>

<template>
  <section class="owed" aria-label="What you owe">
    <h1 class="owed__headline">{{ headline }}</h1>
    <p class="owed__for">
      for <strong>{{ trip.title }}</strong>
      <template v-if="driver && owes > 0">, to {{ driver.name }}</template>
      <template v-else-if="driver && owes < 0">, from {{ driver.name }}</template>
    </p>

    <a v-if="payLink && !paidAt" class="owed__pay" :href="payLink" target="_blank" rel="noopener noreferrer">
      Pay {{ money(owes) }} with Revolut
    </a>

    <!--
      A payment link can land somewhere odd — a blank profile, an app that is
      not installed, a handle that has moved. The details to do it by hand are
      on the page either way, rather than behind a button that may not work.
    -->
    <p v-if="handle && owes > 0" class="owed__fallback">
      <span>Or send it by hand:</span>
      <a :href="`https://revolut.me/${handle}`" target="_blank" rel="noopener noreferrer">
        revolut.me/{{ handle }}
      </a>
      <span class="owed__figure">{{ money(owes) }}</span>
      <span v-if="paymentCurrencyCode(trip)">{{ paymentCurrencyCode(trip) }}</span>
      <span class="owed__note">“{{ paymentNote(person.name, trip.title) }}”</span>
    </p>

    <p v-if="owes < 0" class="hint">
      You paid for more of this trip than your own share. {{ driver?.name ?? 'The driver' }} settles the
      difference with you.
    </p>

    <div v-if="owes > 0" class="owed__done">
      <button
        type="button"
        class="button--quiet"
        :aria-busy="busy"
        @click="busy ? null : emit('togglePaid', person.personId, !paidAt)"
      >
        {{ paidAt ? 'Undo' : "I've sent it" }}
      </button>
      <span v-if="paidAt" class="paid-mark">✓ marked as sent</span>
      <span v-else class="hint">This only tells {{ driver?.name ?? 'the driver' }} to expect it.</span>
    </div>
  </section>
</template>

<style scoped>
.owed {
  padding: var(--s5) 0 var(--s4);
}

.owed__headline {
  font-size: clamp(1.7rem, 7vw, 2.6rem);
  line-height: 1.05;
  text-wrap: balance;
  margin-bottom: var(--s2);
}

.owed__for {
  color: var(--ink-soft);
  font-size: var(--t-small);
  margin-bottom: var(--s4);
}

/* The one action on the page, so the one thing that gets the solid accent. */
.owed__pay {
  display: block;
  text-align: center;
  padding: var(--s3) var(--s4);
  min-height: 52px;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  text-decoration: none;
  line-height: 1.6;
}

.owed__pay:hover {
  background: var(--accent-strong);
}

.owed__fallback {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s2);
  margin-top: var(--s3);
  padding: var(--s3);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface-sunk);
  font-size: var(--t-small);
  color: var(--ink-soft);
}

.owed__figure {
  font-family: var(--font-figure);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.owed__note {
  color: var(--ink-faint);
}

.owed__done {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s3);
  margin-top: var(--s4);
}
</style>
