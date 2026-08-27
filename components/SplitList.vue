<script setup lang="ts">
import type { PersonBreakdown, TripResult } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

/**
 * What each person settles, one line each.
 *
 * This was an eight-column table, six of whose columns were working rather than
 * answer, with the number that matters last. A person is a name, one figure and
 * a verb; the bar under it says what that figure is made of, scaled against the
 * biggest share so the bars compare between people; and the arithmetic is on
 * the line itself for anybody who wants it.
 */
const props = defineProps<{ trip: Trip; result: TripResult }>()

const { money, exact } = useMoney(() => props.trip.currency)

/** Most owed first, and the driver last: they are the hub, not a debtor. */
const people = computed(() =>
  [...props.result.people].sort(
    (a, b) => Number(a.isDriver) - Number(b.isDriver) || b.owes - a.owes || a.name.localeCompare(b.name),
  ),
)

/** Bars are drawn against the largest share, so their lengths mean something. */
const biggest = computed(() => Math.max(...props.result.people.map((person) => person.exactTotal), 1))

function verbFor(person: PersonBreakdown): string {
  if (person.owes > 0) return 'sends'
  if (person.owes < 0) return 'gets back'
  return 'settled up'
}

function slicesFor(person: PersonBreakdown) {
  return [
    { id: 'fuel', name: 'Fuel', weight: person.fuelShare, label: exact(person.fuelShare) },
    { id: 'car', name: 'Car', weight: person.maintenanceShare, label: exact(person.maintenanceShare) },
    { id: 'extras', name: 'Extras', weight: person.overheadShare, label: exact(person.overheadShare) },
  ]
    .filter((slice) => slice.weight > 0)
    .map((slice) => ({ ...slice, isDriver: false }))
}

function metaFor(person: PersonBreakdown): string {
  const legs = person.segmentIds.length
  return `${formatBasis(props.trip, person.energy, person.distanceKm)} over ${legs} ${legs === 1 ? 'leg' : 'legs'}`
}

/**
 * The driver absorbs the difference between whole-unit shares and the whole-unit
 * total. It is real money and it was computed and shown nowhere; it belongs on
 * the line of the person absorbing it, not in a column five readers have to
 * subtract for themselves.
 */
const roundingNote = computed(() =>
  props.result.roundingResidual === 0
    ? ''
    : `carries ${exact(Math.abs(props.result.roundingResidual))} of rounding`,
)

const collection = computed(() => {
  const { collectFromOthers, sendBackTotal } = props.result
  if (!collectFromOthers && !sendBackTotal) return 'Nothing to collect.'
  const parts = [`Collect ${money(collectFromOthers)}`]
  if (sendBackTotal > 0) parts.push(`send ${money(sendBackTotal)} back`)
  return `${parts.join(', ')}.`
})
</script>

<template>
  <div class="split">
    <details
      v-for="person in people"
      :key="person.personId"
      class="person"
      :class="{ 'is-driver': person.isDriver }"
      :aria-label="`${person.name}'s share`"
      role="group"
    >
      <summary class="person__summary">
        <span class="person__head">
          <span class="person__who">
            <strong>{{ person.name }}</strong>
            <small>
              {{ metaFor(person) }}
              <template v-if="person.isDriver && roundingNote">· {{ roundingNote }}</template>
            </small>
          </span>
          <span class="person__figure">
            <strong>{{ money(Math.abs(person.owes)) }}</strong>
            <small>{{ verbFor(person) }}</small>
          </span>
        </span>

        <!-- Scaled against the biggest share, so one bar can be read against another. -->
        <span class="person__bar" :style="{ width: `${Math.max((person.exactTotal / biggest) * 100, 4)}%` }">
          <LitreBar :slices="slicesFor(person)" empty-label="Nothing charged" />
        </span>
      </summary>

      <dl class="bill person__working">
        <div class="bill__line">
          <dt>Their share</dt>
          <dd>{{ exact(person.exactTotal) }}</dd>
        </div>
        <div v-if="person.fuelShare > 0" class="bill__line">
          <dt>
            Fuel<small>{{ formatBasis(trip, person.energy, person.distanceKm) }}</small>
          </dt>
          <dd>{{ exact(person.fuelShare) }}</dd>
        </div>
        <div v-if="person.maintenanceShare > 0" class="bill__line">
          <dt>Car costs</dt>
          <dd>{{ exact(person.maintenanceShare) }}</dd>
        </div>
        <div v-if="person.overheadShare > 0" class="bill__line">
          <dt>Extras</dt>
          <dd>{{ exact(person.overheadShare) }}</dd>
        </div>
        <div v-if="person.fronted > 0" class="bill__line">
          <dt>Already paid<small>and coming back off what they owe</small></dt>
          <dd>−{{ exact(person.fronted) }}</dd>
        </div>
        <div class="bill__line bill__line--total">
          <dt>{{ verbFor(person) === 'gets back' ? 'Gets back' : 'To pay' }}</dt>
          <dd>{{ money(Math.abs(person.owes)) }}</dd>
        </div>
      </dl>
    </details>

    <p class="split__collection">{{ collection }}</p>
  </div>
</template>

<style scoped>
.split {
  display: flex;
  flex-direction: column;
}

.person {
  border-bottom: 1px solid var(--rule);
}

.person__summary {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s3) 0;
  cursor: pointer;
  list-style: none;
}

.person__summary::-webkit-details-marker {
  display: none;
}
.person__summary::marker {
  content: '';
}

.person__summary:hover .person__figure strong {
  color: var(--accent-strong);
}

.person__summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.person__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s4);
}

.person__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.person__who small,
.person__figure small {
  color: var(--ink-faint);
  font-size: var(--t-small);
}

/* The one figure on the line, and the only one that gets the accent. */
.person__figure {
  display: flex;
  align-items: baseline;
  gap: var(--s2);
  white-space: nowrap;
}

.person__figure strong {
  font-family: var(--font-figure);
  font-variant-numeric: tabular-nums;
  font-size: var(--t-figure-lg);
  color: var(--accent);
}

.person.is-driver {
  border-left: 3px solid var(--flag);
  padding-left: var(--s3);
}

.person__bar {
  display: block;
  min-width: 60px;
}

.person__working {
  margin: 0 0 var(--s3);
}

.split__collection {
  padding-top: var(--s3);
  font-size: var(--t-small);
  color: var(--ink-soft);
}
</style>
