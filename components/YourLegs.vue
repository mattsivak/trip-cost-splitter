<script setup lang="ts">
import type { PersonBreakdown, TripResult } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

/**
 * Why that number, for the one person reading.
 *
 * The full working answers the driver's audit question — every expense, every
 * leg, everybody's share. The person who just got a link wants a sentence and
 * their own legs, and nothing else until they ask for it.
 */
const props = defineProps<{ trip: Trip; result: TripResult; person: PersonBreakdown }>()

const { money, exact } = useMoney(() => props.trip.currency)

/** Only the legs they were actually in the car for. */
const mine = computed(() =>
  props.result.segments.filter((segment) => segment.occupantIds.includes(props.person.personId)),
)

const summary = computed(() => {
  const legs = mine.value.length
  const parts: string[] = [
    `You were in the car for ${legs} of the ${props.result.segments.length} legs`,
    formatBasis(props.trip, props.person.energy, props.person.distanceKm),
  ]
  return `${parts.join(', ')}.`
})

function whoElse(occupantIds: readonly string[]): string {
  const count = occupantIds.filter((id) => props.trip.people.some((person) => person.id === id)).length
  return count === 1 ? 'just you' : `split ${count} ways`
}
</script>

<template>
  <div class="mine">
    <p class="mine__lede">{{ summary }}</p>

    <dl class="bill">
      <div v-if="person.fuelShare > 0" class="bill__line">
        <dt>Fuel<small>on the legs you were there for</small></dt>
        <dd>{{ exact(person.fuelShare) }}</dd>
      </div>
      <div v-if="person.maintenanceShare > 0" class="bill__line">
        <dt>
          Car costs<small>{{ formatKm(person.distanceKm) }} of wear</small>
        </dt>
        <dd>{{ exact(person.maintenanceShare) }}</dd>
      </div>
      <div v-if="person.overheadShare > 0" class="bill__line">
        <dt>Extras<small>tolls, parking and the like</small></dt>
        <dd>{{ exact(person.overheadShare) }}</dd>
      </div>
      <div v-if="person.fronted > 0" class="bill__line">
        <dt>What you already paid<small>coming back off what you owe</small></dt>
        <dd>−{{ exact(person.fronted) }}</dd>
      </div>
      <div class="bill__line bill__line--total">
        <dt>{{ person.owes < 0 ? 'You get back' : 'You pay' }}</dt>
        <dd>{{ money(Math.abs(person.owes)) }}</dd>
      </div>
    </dl>

    <p class="eyebrow">Your legs</p>
    <ul class="mine__legs">
      <li v-for="segment in mine" :key="segment.segmentId">
        <span class="mine__leg">
          <strong>{{ segment.label }}</strong>
          <small>
            {{ segment.kind === 'stop' ? 'waiting' : formatKm(segment.distanceKm) }} ·
            {{ whoElse(segment.occupantIds) }}
          </small>
        </span>
        <span class="mine__figure">{{ exact(segment.shares[person.personId] ?? 0) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.mine__lede {
  margin-bottom: var(--s3);
  color: var(--ink-soft);
  font-size: var(--t-small);
}

.mine__legs {
  list-style: none;
  margin: var(--s2) 0 0;
  padding: 0;
}

.mine__legs li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s3);
  padding: var(--s2) 0;
  border-bottom: 1px solid var(--rule);
}

.mine__leg {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mine__leg small {
  color: var(--ink-faint);
  font-size: var(--t-small);
}

.mine__figure {
  font-family: var(--font-figure);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
