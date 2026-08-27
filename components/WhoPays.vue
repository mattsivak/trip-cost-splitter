<script setup lang="ts">
import { formatEnergy } from '~/src/domain/pricing/energyKind'
import { costForSegment, energyForSegment } from '~/src/domain/trip/energy'
import { describeAllocation } from '~/src/domain/trip/overhead'
import type { BuyLine, PersonId, Segment, Trip, TripLine } from '~/src/domain/trip/types'

/**
 * The people half of the ledger, line by line.
 *
 * Step 2 said what happened and what it cost. This one says who it was for and
 * whose money it was — the same list, asked one question instead of five.
 */
const props = defineProps<{ trip: Trip }>()

const { money } = useMoney(() => props.trip.currency)

const perKm = computed(() => props.trip.pricing.mode === 'per-km')
const ratePerKm = computed(() => (props.trip.pricing.mode === 'per-km' ? props.trip.pricing.ratePerKm : 0))

function worthOf(segment: Segment): number {
  return perKm.value ? costForSegment(segment, ratePerKm.value) : energyForSegment(segment, props.trip)
}

function worthLabel(segment: Segment, count = 1): string {
  const each = worthOf(segment) / Math.max(count, 1)
  return perKm.value ? money(Math.round(each)) : formatEnergy(each, props.trip.energyKind)
}

function slicesFor(segment: Segment) {
  const aboard = segment.occupantIds.filter((id) => props.trip.people.some((person) => person.id === id))
  if (!aboard.length) return []

  const weight = worthOf(segment) / aboard.length
  const label = worthLabel(segment, aboard.length)

  return aboard.flatMap((personId) => {
    const person = props.trip.people.find((entry) => entry.id === personId)
    if (!person) return []
    return [{ id: person.id, name: person.name, weight, label, isDriver: person.id === props.trip.driverId }]
  })
}

function shareLabels(segment: Segment): Record<PersonId, string> {
  const count = segment.occupantIds.length
  if (!count) return {}
  const each = worthLabel(segment, count)
  return Object.fromEntries(segment.occupantIds.map((personId) => [personId, each]))
}

function toggle(segment: Segment, personId: PersonId) {
  segment.occupantIds = segment.occupantIds.includes(personId)
    ? segment.occupantIds.filter((id) => id !== personId)
    : [...segment.occupantIds, personId]
}

function setAll(segment: Segment, everyone: boolean) {
  segment.occupantIds = everyone ? props.trip.people.map((person) => person.id) : []
}

/** Everything after this line gets the same people. The commonest edit there is. */
function copyDown(index: number) {
  const source = props.trip.lines[index]
  if (!source || source.kind === 'buy') return
  for (const line of props.trip.lines.slice(index + 1)) {
    if (line.kind !== 'buy') line.occupantIds = [...source.occupantIds]
  }
}

const payerOf = (line: BuyLine) => line.paidBy ?? props.trip.driverId ?? ''

function setPayer(line: BuyLine, personId: PersonId) {
  if (personId && personId !== props.trip.driverId) line.paidBy = personId
  else delete line.paidBy
}

function forWhom(line: BuyLine): string {
  if (line.funds === 'fuel') return 'the driving'
  if (line.allocation.type === 'fixed') return 'set amounts'
  const who = describeAllocation(line, props.trip.people)
  return who === 'everyone' ? 'everyone' : who
}

const label = (line: TripLine) => line.label || (line.kind === 'buy' ? 'Purchase' : 'Untitled')
</script>

<template>
  <section class="section" style="margin-top: 0" aria-label="Who pays">
    <div class="section__head">
      <div>
        <p class="eyebrow">Step 3</p>
        <h2>Who pays for what</h2>
      </div>
    </div>

    <p v-if="!trip.people.length" class="hint">Add people first.</p>

    <article
      v-for="(line, index) in trip.lines"
      :key="line.id"
      class="who"
      role="group"
      :aria-label="label(line)"
    >
      <header class="who__head">
        <strong>{{ label(line) }}</strong>
        <small v-if="line.kind === 'buy'">{{ money(line.amount) }} · for {{ forWhom(line) }}</small>
        <small v-else>{{ worthLabel(line) }} · {{ line.occupantIds.length }} aboard</small>
      </header>

      <template v-if="line.kind === 'buy'">
        <p class="eyebrow">Who paid</p>
        <div class="toggles who__payers">
          <label
            v-for="person in trip.people"
            :key="person.id"
            class="toggle"
            :class="{ 'is-on': person.id === payerOf(line) }"
          >
            <input
              type="radio"
              :name="`payer-${line.id}`"
              :checked="person.id === payerOf(line)"
              @change="setPayer(line, person.id)"
            />
            <span>{{ person.name }}</span>
          </label>
        </div>

        <div v-if="line.funds === 'people'" class="who__split">
          <OverheadSplit :trip="trip" :cost="line" embedded />
        </div>
      </template>

      <template v-else>
        <LitreBar :slices="slicesFor(line)" empty-label="Nobody aboard — this falls to the driver" />
        <OccupantToggles
          :people="trip.people"
          :occupant-ids="line.occupantIds"
          :driver-id="trip.driverId"
          :shares="shareLabels(line)"
          @toggle="(personId) => toggle(line, personId)"
        />
        <div class="button-row">
          <button type="button" class="button--quiet" @click="setAll(line, true)">Everyone</button>
          <button type="button" class="button--quiet" @click="setAll(line, false)">Nobody</button>
          <button
            v-if="index < trip.lines.length - 1"
            type="button"
            class="button--quiet"
            @click="copyDown(index)"
          >
            Copy down
          </button>
        </div>
      </template>
    </article>
  </section>
</template>

<style scoped>
.who {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s3) 0;
  border-bottom: 1px solid var(--rule);
}

.who__head {
  display: flex;
  align-items: baseline;
  gap: var(--s2);
  flex-wrap: wrap;
}

.who__head small {
  color: var(--ink-faint);
  font-size: var(--t-small);
}

.who__split {
  padding-top: var(--s2);
  border-top: 1px dotted var(--rule);
}
</style>
