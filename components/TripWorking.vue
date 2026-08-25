<script setup lang="ts">
import { formatEnergyMix } from '~/src/domain/trip/energy'
import type { TripResult } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

/** The per-part breakdown, read-only. People query these splits; this answers them. */
const props = defineProps<{ trip: Trip; result: TripResult }>()

const { money, exact } = useMoney(() => props.trip.currency)

/** Idle stops have no distance; showing a dash is honest, showing 0 km is not. */
function distanceFor(segmentId: string): string {
  const segment = props.trip.segments.find((entry) => entry.id === segmentId)
  return segment?.kind === 'drive' ? formatKm(segment.distanceKm) : '—'
}

function whoWasOn(occupantIds: readonly string[]): string {
  const names = occupantIds
    .map((id) => props.trip.people.find((person) => person.id === id)?.name)
    .filter(Boolean)
  return names.length ? names.join(', ') : 'nobody'
}
</script>

<template>
  <div class="stack">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Part</th>
            <th class="is-figure">Distance</th>
            <th class="is-figure">Used</th>
            <th>Who was aboard</th>
            <th class="is-figure">Each</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="segment in result.segments" :key="segment.segmentId">
            <td class="is-rowhead">
              <span class="cell-name">
                <strong>{{ segment.label }}</strong>
                <small>{{ segment.kind === 'idle' ? 'idling' : 'drive' }}</small>
              </span>
            </td>
            <td class="is-figure" data-label="Distance">{{ distanceFor(segment.segmentId) }}</td>
            <td class="is-figure" data-label="Used">{{ formatEnergyMix(segment.energy, trip.streams) }}</td>
            <td data-label="Who was aboard">{{ whoWasOn(segment.occupantIds) }}</td>
            <td class="is-figure" data-label="Each">{{ exact(segment.costPerOccupant) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th class="is-figure">Used</th>
            <th class="is-figure">Exact</th>
            <th class="is-figure">Rounded</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in result.people"
            :key="person.personId"
            :class="{ 'is-driver': person.isDriver }"
          >
            <td class="is-rowhead">
              <span class="cell-name">
                <strong>{{ person.name }}</strong>
                <small>{{
                  person.isDriver
                    ? 'drove, and paid up front'
                    : `${person.segmentIds.length} ${person.segmentIds.length === 1 ? 'part' : 'parts'}`
                }}</small>
              </span>
            </td>
            <td class="is-figure" data-label="Used">{{ formatEnergyMix(person.energy, trip.streams) }}</td>
            <td class="is-figure" data-label="Exact">{{ exact(person.exactTotal) }}</td>
            <td class="is-figure" data-label="Rounded">{{ money(person.payable) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="hint">
      Everyone pays for the fuel used on the stretches they were actually in the car for, split evenly between
      whoever was aboard. Amounts are rounded to whole {{ trip.currency }}; the driver carries the difference.
    </p>
  </div>
</template>
