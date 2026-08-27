<script setup lang="ts">
import { formatEnergy, unitLabelFor } from '~/src/domain/pricing/energyKind'
import { insertAfter } from '~/src/domain/list'
import { createDrive, createIdle, driveLabel } from '~/src/domain/trip/factories'
import { costForSegment, energyForSegment } from '~/src/domain/trip/energy'
import { routeToSegments } from '~/src/domain/routing/routeToSegments'
import { reanchorIdleStops } from '~/src/domain/trip/reanchorIdleStops'
import { fromMajor, toMajor } from '~/src/domain/money/money'
import type { GeoPoint } from '~/src/domain/routing/types'
import type { IdleSegment, PersonId, Segment, Trip } from '~/src/domain/trip/types'

/**
 * The trip object is reactive and owned by the page; steps edit it in place.
 * With a wizard this small, threading every field change back up through
 * events would be more machinery than the problem deserves.
 */
const props = defineProps<{ trip: Trip }>()

const { money } = useMoney(() => props.trip.currency)

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

  // Idle stops are the user's own measurements, so a lookup must not wipe them
  // — and must not dump them at the end either, since a stop's fuel is split
  // against whoever is assigned to it where it sits.
  const idleStops = props.trip.segments.filter((segment) => segment.kind === 'idle').length
  props.trip.segments = reanchorIdleStops(props.trip.segments, routeToSegments(plan, driverOnly()))

  const provider = plan.provider === 'mapy' ? 'Mapy.com' : 'OpenStreetMap'
  const kept =
    idleStops > 0
      ? ` Your ${idleStops === 1 ? 'waiting stop stays' : 'waiting stops stay'} where they happened.`
      : ''
  lookupNote.value = `Found ${plan.legs.length} drives via ${provider}. Every distance below is editable.${kept}`
}

function driverOnly(): string[] {
  return props.trip.driverId ? [props.trip.driverId] : []
}

function addDrive() {
  props.trip.segments.push(createDrive('', '', { occupantIds: driverOnly() }))
}

/**
 * `afterIndex` puts the stop straight after the drive it belongs to. Without
 * it the stop lands at the end of the route, which is not where it happened
 * and would be split against the wrong people.
 */
function addIdleStop(location = '', afterIndex = -1) {
  props.trip.segments = insertAfter(
    props.trip.segments,
    afterIndex,
    createIdle(location, { occupantIds: driverOnly() }),
  )
}

function remove(segmentId: string) {
  props.trip.segments = props.trip.segments.filter((segment) => segment.id !== segmentId)
}

const { draggingIndex, onDragStart, onDragOver, onDrop, endDrag, dropEdge, move } = useSegmentReorder(
  () => props.trip.segments,
  (segments) => {
    props.trip.segments = segments
  },
)

function relabel(segment: Trip['segments'][number]) {
  if (segment.kind === 'drive') segment.label = driveLabel(segment.from, segment.to)
}

function quantity(segment: Trip['segments'][number]): number {
  return energyForSegment(segment, props.trip)
}

/**
 * Priced by the kilometre, no fuel is counted, so the consumption figure and
 * everything derived from it would only be decoration on a number nobody uses.
 */
const perKm = computed(() => props.trip.pricing.mode === 'per-km')
const ratePerKm = computed(() => (props.trip.pricing.mode === 'per-km' ? props.trip.pricing.ratePerKm : 0))

const idleCostMajor = (segment: IdleSegment) => toMajor(segment.cost ?? 0)

function setIdleCost(segment: IdleSegment, value: number) {
  segment.cost = fromMajor(value)
}

/** What a segment contributed, however this trip is being priced. */
function segmentBasis(segment: Trip['segments'][number]): string {
  if (perKm.value) return segment.kind === 'drive' ? formatKm(segment.distanceKm) : 'waiting'
  return formatEnergy(quantity(segment), props.trip.energyKind)
}
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
  <div class="stack">
    <section class="section" style="margin-top: 0">
      <div class="section__head">
        <div>
          <p class="eyebrow">The journey</p>
          <h2>Where the car went</h2>
          <p class="section__lede">
            Look the route up from a list of stops, or add each drive by hand. Every distance stays editable
            afterwards — the map is a starting point, not the last word.
          </p>
        </div>
      </div>

      <div class="field-row" style="align-items: end">
        <label class="field field--wide">
          <span>Stops, one per line</span>
          <textarea v-model="stopsDraft" rows="6" placeholder="Šumperk&#10;Olomouc&#10;Milovice" />
        </label>
      </div>

      <div class="button-row" style="margin-top: 12px">
        <button type="button" :disabled="routing.busy.value" @click="lookUpRoute">
          {{ routing.busy.value ? 'Looking up…' : 'Look up the route' }}
        </button>
        <button type="button" class="button--quiet" @click="addDrive">Add a drive</button>
        <button type="button" class="button--quiet" @click="addIdleStop()">Add a waiting stop</button>
      </div>

      <p v-if="routing.error.value" class="notice" style="margin-top: 12px">
        <span class="notice__mark">!</span><span>{{ routing.error.value }}</span>
      </p>
      <p v-else-if="lookupNote" class="hint" style="margin-top: 12px">{{ lookupNote }}</p>
    </section>

    <section class="section">
      <div class="section__head">
        <div>
          <p class="eyebrow">{{ trip.segments.length }} legs</p>
          <h2>The route, leg by leg</h2>
          <p class="section__lede">
            <!-- The handle only exists where dragging does; on touch the arrows are the whole story. -->
            <span class="only-fine">Drag a leg by its handle to reorder it, or use the arrows.</span>
            <span class="only-coarse">Use the arrows to reorder a leg.</span>
          </p>
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
        role="group"
        :aria-label="segment.label || 'Untitled leg'"
        :class="{
          'segment--idle': segment.kind === 'idle',
          'is-dragging': draggingIndex === index,
          'is-drop-before': dropEdge(index) === 'before',
          'is-drop-after': dropEdge(index) === 'after',
        }"
        @dragover="onDragOver(index, $event)"
        @drop.prevent="onDrop(index)"
      >
        <div class="segment__head">
          <span
            class="grip"
            draggable="true"
            role="button"
            tabindex="-1"
            :aria-label="`Drag to reorder ${segment.label || 'this leg'}`"
            @dragstart="onDragStart(index, $event)"
            @dragend="endDrag"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" focusable="false">
              <circle cx="2" cy="3" r="1.4" />
              <circle cx="8" cy="3" r="1.4" />
              <circle cx="2" cy="8" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="2" cy="13" r="1.4" />
              <circle cx="8" cy="13" r="1.4" />
            </svg>
          </span>
          <div class="segment__title">
            <h3>{{ segment.label || 'Untitled' }}</h3>
            <span class="segment__meta">
              {{ segment.kind === 'drive' ? segment.distanceSource : 'measured' }} ·
              {{ segmentBasis(segment) }}
            </span>
          </div>
          <div class="button-row">
            <button
              type="button"
              class="button--danger"
              :aria-disabled="index === 0"
              :aria-label="`Move ${segment.label || 'this leg'} earlier`"
              @click="index === 0 ? null : move(index, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="button--danger"
              :aria-disabled="index === trip.segments.length - 1"
              :aria-label="`Move ${segment.label || 'this leg'} later`"
              @click="index === trip.segments.length - 1 ? null : move(index, 1)"
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
            <input v-model.number="segment.distanceKm" type="number" inputmode="decimal" min="0" step="0.1" />
          </label>
          <label v-if="!perKm" class="field">
            <span>Consumption</span>
            <input
              v-model.number="segment.consumptionPer100Km"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.1"
              :placeholder="String(trip.consumptionPer100Km)"
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
          <label v-if="perKm" class="field">
            <span>{{ trip.currency }} it cost</span>
            <input
              :value="idleCostMajor(segment)"
              type="number"
              inputmode="decimal"
              min="0"
              step="1"
              @input="setIdleCost(segment, Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <label v-else class="field">
            <span>{{ unitLabelFor(trip.energyKind) }} used</span>
            <input v-model.number="segment.energy" type="number" inputmode="decimal" min="0" step="0.1" />
          </label>
        </div>

        <!--
          Who was aboard, on the same card as the distance. These were two
          screens drawing the same list, so changing one drive meant walking
          between them; the bar re-cuts as you toggle, which is the argument
          the whole app is making.
        -->
        <div class="segment__people">
          <LitreBar :slices="slicesFor(segment)" empty-label="Nobody aboard — this falls to the driver" />

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
        </div>
        <div v-if="segment.kind === 'drive'" class="button-row">
          <button type="button" class="button--quiet" @click="addIdleStop(segment.to, index)">
            Add a waiting stop after this
          </button>
        </div>
      </article>
    </section>
  </div>
</template>
