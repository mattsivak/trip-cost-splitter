<script setup lang="ts">
import { formatEnergy } from '~/src/domain/pricing/energyKind'
import { toMajor } from '~/src/domain/money/money'
import { buildRevolutLink, normalizeRevolutHandle } from '~/src/domain/settle/revolut'
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

const owing = computed(() =>
  props.people
    .filter((person) => !person.isDriver && person.payable > 0)
    .sort((a, b) => b.payable - a.payable),
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
  if (!props.trip.revolutHandle || !props.trip.currencyCode) return null
  return buildRevolutLink(props.trip.revolutHandle, toMajor(person.payable), props.trip.currencyCode)
}

const driver = computed(() => props.people.find((person) => person.isDriver))

/** The account the money is going to, spelled out rather than hidden in a button. */
const payee = computed(() => {
  const handle = props.trip.revolutHandle ? normalizeRevolutHandle(props.trip.revolutHandle) : null
  return handle ? { handle, url: `https://revolut.me/${handle}` } : null
})

const outstanding = computed(() =>
  owing.value
    .filter((person) => !props.trip.paidAt[person.personId])
    .reduce((sum, person) => sum + person.payable, 0),
)
</script>

<template>
  <div>
    <p v-if="payee" class="payee">
      Money goes to <strong>{{ driver?.name ?? 'the driver' }}</strong> at
      <a :href="payee.url" target="_blank" rel="noopener noreferrer">revolut.me/{{ payee.handle }}</a
      >. Each button below opens Revolut with that person's amount already filled in.
    </p>

    <div v-if="!owing.length" class="empty"><p>Nothing to collect.</p></div>

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
            {{ formatEnergy(person.energy, trip.energyKind) }} over {{ person.segmentIds.length }}
            {{ person.segmentIds.length === 1 ? 'part' : 'parts' }}
          </small>
        </div>

        <span class="settle-row__amount">{{ money(person.payable) }}</span>

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
          Pay {{ money(person.payable) }}
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
  </div>
</template>
