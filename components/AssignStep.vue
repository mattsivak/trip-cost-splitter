<script setup lang="ts">
import { energyMixForSegment, formatEnergyMix, type EnergyMix } from '~/src/domain/trip/energy'
import type { PersonId, Segment, Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip }>()

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

function mixFor(segment: Segment): EnergyMix {
  return energyMixForSegment(segment, props.trip.streams)
}

function label(segment: Segment): string {
  return formatEnergyMix(mixFor(segment), props.trip.streams)
}

/**
 * How long a slice should be.
 *
 * The bar argues about money, so it is sized by money: litres and
 * kilowatt-hours have no common length, and a stream nobody is billed for
 * should not push anyone's slice out. Where no price is set yet — a brand new
 * trip, or `from-receipts` before the receipts arrive — the first stream's
 * quantity stands in, so the bar is drawn rather than blank.
 */
function weightFor(segment: Segment): number {
  const mix = mixFor(segment)
  const priced = props.trip.streams.reduce(
    (sum, stream) => sum + (stream.billed ? (mix[stream.id] ?? 0) * stream.pricePerUnit : 0),
    0,
  )
  if (priced > 0) return priced

  const first = props.trip.streams.find((stream) => stream.billed) ?? props.trip.streams[0]
  return first ? (mix[first.id] ?? 0) : 0
}

/** What one occupant's share of a segment comes to, written out. */
function eachLabel(segment: Segment, count: number): string {
  if (!count) return ''

  const mix = mixFor(segment)
  const each: EnergyMix = {}
  for (const stream of props.trip.streams) each[stream.id] = (mix[stream.id] ?? 0) / count
  return formatEnergyMix(each, props.trip.streams)
}

function slicesFor(segment: Segment) {
  const occupants = segment.occupantIds.filter((id) => props.trip.people.some((person) => person.id === id))
  const weight = occupants.length ? weightFor(segment) / occupants.length : 0
  const label = eachLabel(segment, occupants.length)

  return occupants.flatMap((personId) => {
    const person = props.trip.people.find((entry) => entry.id === personId)
    if (!person) return []
    return [{ id: person.id, name: person.name, weight, label, isDriver: person.id === props.trip.driverId }]
  })
}

function shareLabels(segment: Segment): Record<PersonId, string> {
  const text = eachLabel(segment, segment.occupantIds.length)
  if (!text) return {}
  return Object.fromEntries(segment.occupantIds.map((personId) => [personId, text]))
}
</script>

<template>
  <section class="section" style="margin-top: 0">
    <div class="section__head">
      <div>
        <p class="eyebrow">Step 3</p>
        <h2>Who was in for each stretch</h2>
        <p class="section__lede">
          A stretch is split evenly between everyone who was there for it. The bar shows exactly how each part
          is being cut.
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
            {{ segment.kind === 'drive' ? formatKm(segment.distanceKm) : 'idling' }} · {{ label(segment) }} ·
            {{ segment.occupantIds.length }} assigned
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
