<script setup lang="ts">
import { formatEnergy } from '~/src/domain/pricing/energyKind'
import { costForSegment, energyForSegment } from '~/src/domain/trip/energy'
import type { PersonId, Segment, Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip }>()

const { money } = useMoney(() => props.trip.currency)

const perKm = computed(() => props.trip.pricing.mode === 'per-km')
const ratePerKm = computed(() => (props.trip.pricing.mode === 'per-km' ? props.trip.pricing.ratePerKm : 0))

/**
 * What a segment is worth, in whatever this trip measures shares in: litres of
 * fuel, or money outright when it is priced by the kilometre and no fuel was
 * ever counted. The bar only compares one segment's slices against each other,
 * so any internally consistent quantity cuts it correctly.
 */
function worthOf(segment: Segment): number {
  return perKm.value ? costForSegment(segment, ratePerKm.value) : energyForSegment(segment, props.trip)
}

/** That worth written out, optionally divided between the people sharing it. */
function worthLabel(segment: Segment, count = 1): string {
  const each = worthOf(segment) / Math.max(count, 1)
  return perKm.value ? money(Math.round(each)) : formatEnergy(each, props.trip.energyKind)
}

function toggle(segment: Segment, personId: PersonId) {
  segment.occupantIds = segment.occupantIds.includes(personId)
    ? segment.occupantIds.filter((id) => id !== personId)
    : [...segment.occupantIds, personId]
}

function setAll(segment: Segment, everyone: boolean) {
  segment.occupantIds = everyone ? props.trip.people.map((person) => person.id) : []
}

function applyToRest(index: number) {
  const source = props.trip.segments[index]
  if (!source) return
  for (const segment of props.trip.segments.slice(index + 1)) {
    segment.occupantIds = [...source.occupantIds]
  }
}

function slicesFor(segment: Segment) {
  const occupants = segment.occupantIds.filter((id) => props.trip.people.some((person) => person.id === id))
  if (!occupants.length) return []

  const weight = worthOf(segment) / occupants.length
  const label = worthLabel(segment, occupants.length)

  return occupants.flatMap((personId) => {
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
</script>

<template>
  <section class="section" style="margin-top: 0">
    <div class="section__head">
      <div>
        <p class="eyebrow">Step 3</p>
        <h2>Who was in the car for each leg</h2>
        <p class="section__lede">
          A leg is split evenly between everyone who was there for it. The bar shows exactly how each one is
          being cut.
        </p>
      </div>
    </div>

    <div v-if="!trip.segments.length" class="empty">
      <p>Add some drives in step 1 first.</p>
    </div>

    <article
      v-for="(segment, index) in trip.segments"
      :key="segment.id"
      class="segment"
      :class="{ 'segment--idle': segment.kind === 'idle' }"
    >
      <div class="segment__head">
        <div class="segment__title">
          <h3>{{ segment.label || 'Untitled' }}</h3>
          <span class="segment__meta">
            {{ segment.kind === 'drive' ? formatKm(segment.distanceKm) : 'waiting' }} ·
            {{ worthLabel(segment) }} · {{ segment.occupantIds.length }} assigned
          </span>
        </div>
      </div>

      <LitreBar :slices="slicesFor(segment)" empty-label="Nobody assigned — this falls to the driver" />

      <OccupantToggles
        :people="trip.people"
        :occupant-ids="segment.occupantIds"
        :driver-id="trip.driverId"
        :shares="shareLabels(segment)"
        @toggle="(personId) => toggle(segment, personId)"
      />

      <div class="button-row">
        <button type="button" class="button--quiet" @click="setAll(segment, true)">Everyone</button>
        <button type="button" class="button--quiet" @click="setAll(segment, false)">Nobody</button>
        <button
          v-if="index < trip.segments.length - 1"
          type="button"
          class="button--quiet"
          @click="applyToRest(index)"
        >
          Copy to the rest
        </button>
      </div>
    </article>
  </section>
</template>
