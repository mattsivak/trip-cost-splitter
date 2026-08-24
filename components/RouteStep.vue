<script setup lang="ts">
import { createDrive, createIdle, driveLabel } from '~/src/domain/trip/factories'
import { litersForSegment } from '~/src/domain/trip/fuel'
import { routeToSegments } from '~/src/domain/routing/routeToSegments'
import type { GeoPoint } from '~/src/domain/routing/types'
import type { Trip } from '~/src/domain/trip/types'

/**
 * The trip object is reactive and owned by the page; steps edit it in place.
 * With a wizard this small, threading every field change back up through
 * events would be more machinery than the problem deserves.
 */
const props = defineProps<{ trip: Trip }>()

const routing = useRouting()
const stopsDraft = ref(props.trip.routePoints.map((point) => point.label).join('\n'))
const lookupNote = ref('')

const stops = computed(() =>
  stopsDraft.value
    .split(/\n|→|->|;/)
    .map((stop) => stop.trim())
    .filter(Boolean),
)

async function lookUpRoute() {
  lookupNote.value = ''
  if (stops.value.length < 2) {
    lookupNote.value = 'Enter at least two stops, one per line.'
    return
  }

  const points: GeoPoint[] = []
  for (const stop of stops.value) {
    const found = await routing.geocode(stop)
    const best = found?.results[0]
    if (!best) {
      lookupNote.value = `Could not find “${stop}”. Try a fuller name, or add the drives by hand.`
      return
    }
    points.push({ ...best, label: stop })
  }

  const plan = await routing.route(points)
  if (!plan) return

  props.trip.routePoints = points.map((point, index) => ({
    id: `point-${index + 1}`,
    label: point.label,
    query: point.label,
    lat: point.lat,
    lon: point.lon,
  }))

  // Idle stops are the user's own measurements — a route lookup must not wipe them.
  const idleStops = props.trip.segments.filter((segment) => segment.kind === 'idle')
  props.trip.segments = [...routeToSegments(plan, driverOnly()), ...idleStops]
  lookupNote.value = `Found ${plan.legs.length} drives via ${plan.provider === 'mapy' ? 'Mapy.com' : 'OpenStreetMap'}. Every distance below is editable.`
}

function driverOnly(): string[] {
  return props.trip.driverId ? [props.trip.driverId] : []
}

function addDrive() {
  props.trip.segments.push(createDrive('', '', { occupantIds: driverOnly() }))
}

function addIdleStop(location = '') {
  props.trip.segments.push(createIdle(location, { occupantIds: driverOnly() }))
}

function remove(segmentId: string) {
  props.trip.segments = props.trip.segments.filter((segment) => segment.id !== segmentId)
}

function move(index: number, delta: number) {
  const target = index + delta
  const segments = props.trip.segments
  if (target < 0 || target >= segments.length) return
  const [moved] = segments.splice(index, 1)
  if (moved) segments.splice(target, 0, moved)
}

function relabel(segment: Trip['segments'][number]) {
  if (segment.kind === 'drive') segment.label = driveLabel(segment.from, segment.to)
}

function liters(segment: Trip['segments'][number]): number {
  return litersForSegment(segment, props.trip)
}
</script>

<template>
  <div class="stack">
    <section class="section" style="margin-top: 0">
      <div class="section__head">
        <div>
          <p class="eyebrow">Step 1</p>
          <h2>Where the car went</h2>
          <p class="section__lede">
            Look the route up from a list of stops, or add each drive by hand. Every distance stays editable
            afterwards — the map is a starting point, not the last word.
          </p>
        </div>
      </div>

      <div class="field-row" style="align-items: end">
        <label class="field" style="grid-column: span 2">
          <span>Stops, one per line</span>
          <textarea v-model="stopsDraft" rows="6" placeholder="Šumperk&#10;Olomouc&#10;Milovice" />
        </label>
        <div class="stack stack--tight">
          <label class="field">
            <span>Consumption L/100 km</span>
            <input v-model.number="trip.defaultConsumptionLPer100Km" type="number" min="0" step="0.1" />
          </label>
          <p class="hint">Used for any drive without its own figure.</p>
        </div>
      </div>

      <div class="button-row" style="margin-top: 12px">
        <button type="button" :disabled="routing.busy.value" @click="lookUpRoute">
          {{ routing.busy.value ? 'Looking up…' : 'Look up the route' }}
        </button>
        <button type="button" class="button--quiet" @click="addDrive">Add a drive</button>
        <button type="button" class="button--quiet" @click="addIdleStop()">Add an idle stop</button>
      </div>

      <p v-if="routing.error.value" class="notice" style="margin-top: 12px">
        <span class="notice__mark">!</span><span>{{ routing.error.value }}</span>
      </p>
      <p v-else-if="lookupNote" class="hint" style="margin-top: 12px">{{ lookupNote }}</p>
    </section>

    <section class="section">
      <div class="section__head">
        <div>
          <p class="eyebrow">{{ trip.segments.length }} parts</p>
          <h2>The route, part by part</h2>
        </div>
      </div>

      <div v-if="!trip.segments.length" class="empty">
        <p>No drives yet.</p>
        <div class="button-row">
          <button type="button" class="button--quiet" @click="addDrive">Add the first drive</button>
        </div>
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
              {{ segment.kind === 'drive' ? segment.distanceSource : 'measured' }} ·
              {{ formatLiters(liters(segment)) }}
            </span>
          </div>
          <div class="button-row">
            <button type="button" class="button--danger" :disabled="index === 0" @click="move(index, -1)">
              ↑
            </button>
            <button
              type="button"
              class="button--danger"
              :disabled="index === trip.segments.length - 1"
              @click="move(index, 1)"
            >
              ↓
            </button>
            <button type="button" class="button--danger" @click="remove(segment.id)">Remove</button>
          </div>
        </div>

        <div v-if="segment.kind === 'drive'" class="field-row">
          <label class="field">
            <span>From</span>
            <input v-model="segment.from" @input="relabel(segment)" />
          </label>
          <label class="field">
            <span>To</span>
            <input v-model="segment.to" @input="relabel(segment)" />
          </label>
          <label class="field">
            <span>Distance km</span>
            <input v-model.number="segment.distanceKm" type="number" min="0" step="0.1" />
          </label>
          <label class="field">
            <span>Consumption</span>
            <input
              v-model.number="segment.consumptionLPer100Km"
              type="number"
              min="0"
              step="0.1"
              :placeholder="String(trip.defaultConsumptionLPer100Km)"
            />
          </label>
        </div>

        <div v-else class="field-row">
          <label class="field">
            <span>What happened</span>
            <input v-model="segment.label" />
          </label>
          <label class="field">
            <span>Where</span>
            <input v-model="segment.location" />
          </label>
          <label class="field">
            <span>Litres burned</span>
            <input v-model.number="segment.liters" type="number" min="0" step="0.1" />
          </label>
        </div>

        <div v-if="segment.kind === 'drive'" class="button-row">
          <button type="button" class="button--quiet" @click="addIdleStop(segment.to)">
            Add an idle stop after this
          </button>
        </div>
      </article>
    </section>
  </div>
</template>
