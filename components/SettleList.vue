<script setup lang="ts">
import { canBuildPaymentLinks, paymentLinkFor } from '~/src/domain/settle/payment'
import { normalizeRevolutHandle, paymentNote } from '~/src/domain/settle/revolut'
import type { PersonBreakdown } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

/**
 * Who still owes what, with a way to pay and a way to say you have.
 *
 * Shared between the owner's Collect step and the public view, so the two can
 * never disagree about who has settled up.
 */
const props = defineProps<{
  trip: Trip
  people: PersonBreakdown[]
  /** Off in the owner's step for the driver, who owes nobody. */
  busyPersonId?: string | null
}>()

const emit = defineEmits<{ togglePaid: [personId: string, paid: boolean] }>()

const { money } = useMoney(() => props.trip.currency)

/**
 * Everything settles through the driver: whoever is down sends them money, and
 * they send money back to anyone who laid out more than their share. So these
 * lists run on the net position, not on the bill — somebody who bought the
 * second tank should never be shown a button asking them to pay again.
 */
const owing = computed(() =>
  props.people.filter((person) => !person.isDriver && person.owes > 0).sort((a, b) => b.owes - a.owes),
)

const owedBack = computed(() =>
  props.people.filter((person) => !person.isDriver && person.owes < 0).sort((a, b) => a.owes - b.owes),
)

function paidOn(personId: string): string {
  const at = props.trip.paidAt[personId]
  if (!at) return ''
  const date = new Date(at)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function payLink(person: PersonBreakdown): string | null {
  // owes is already minor units, which is what the link wants.
  return paymentLinkFor(props.trip, person.owes, paymentNote(person.name, props.trip.title))
}

/** Guards the sentence about buttons, so it cannot promise ones that are absent. */
const hasPayButtons = computed(() => canBuildPaymentLinks(props.trip))

const driver = computed(() => props.people.find((person) => person.isDriver))

/** The account the money is going to, spelled out rather than hidden in a button. */
const payee = computed(() => {
  const handle = props.trip.revolutHandle ? normalizeRevolutHandle(props.trip.revolutHandle) : null
  return handle ? { handle, url: `https://revolut.me/${handle}` } : null
})

const outstanding = computed(() =>
  owing.value
    .filter((person) => !props.trip.paidAt[person.personId])
    .reduce((sum, person) => sum + person.owes, 0),
)
</script>

<template>
  <div>
    <p v-if="payee" class="payee">
      Money goes to <strong>{{ driver?.name ?? 'the driver' }}</strong> at
      <a :href="payee.url" target="_blank" rel="noopener noreferrer">revolut.me/{{ payee.handle }}</a
      ><template v-if="hasPayButtons">
        . Each button below opens Revolut with that person's amount already filled in.
      </template>
      <template v-else>. Send them {{ trip.currency }} there.</template>
    </p>

    <div v-if="!owing.length && !owedBack.length" class="empty"><p>Nothing to collect.</p></div>

    <div v-else>
      <div
        v-for="person in owing"
        :key="person.personId"
        class="settle-row"
        :class="{ 'is-paid': Boolean(trip.paidAt[person.personId]) }"
      >
        <div class="settle-row__who">
          <strong>{{ person.name }}</strong>
          <small class="settle-row__meta">
            {{ formatBasis(trip, person.energy, person.distanceKm) }} over {{ person.segmentIds.length }}
            {{ person.segmentIds.length === 1 ? 'part' : 'parts' }}
          </small>
        </div>

        <span class="settle-row__amount">{{ money(person.owes) }}</span>

        <span v-if="trip.paidAt[person.personId]" class="paid-mark"
          >✓ paid {{ paidOn(person.personId) }}</span
        >

        <a
          v-else-if="payLink(person)"
          class="pay-link"
          :href="payLink(person) ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
        >
          Pay {{ money(person.owes) }}
        </a>

        <button
          type="button"
          class="button--quiet"
          :disabled="busyPersonId === person.personId"
          @click="emit('togglePaid', person.personId, !trip.paidAt[person.personId])"
        >
          {{ trip.paidAt[person.personId] ? 'Undo' : 'Mark paid' }}
        </button>
      </div>

      <p class="hint" style="margin-top: 12px">
        Still outstanding: <strong>{{ money(outstanding) }}</strong
        >. Marking someone paid is a note between friends — nothing here can see the money arrive.
      </p>
    </div>

    <!--
      The traffic that runs the other way. Somebody who bought a tank of fuel
      out of their own pocket is not settled up until this happens either.
    -->
    <div v-if="owedBack.length" class="settle-back">
      <p class="hint">
        <strong>{{ driver?.name ?? 'The driver' }} sends back</strong> what these people laid out over their
        own share:
      </p>
      <div v-for="person in owedBack" :key="person.personId" class="settle-row">
        <div class="settle-row__who">
          <strong>{{ person.name }}</strong>
          <small class="settle-row__meta">paid {{ money(person.fronted) }} up front</small>
        </div>
        <span class="settle-row__amount">{{ money(-person.owes) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settle-back {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px dotted var(--rule);
}
</style>
