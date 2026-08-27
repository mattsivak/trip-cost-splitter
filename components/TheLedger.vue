<script setup lang="ts">
import { fromMajor, toMajor } from '~/src/domain/money/money'
import { unitLabelFor } from '~/src/domain/pricing/energyKind'
import { routeToSegments } from '~/src/domain/routing/routeToSegments'
import type { GeoPoint } from '~/src/domain/routing/types'
import { insertAfter } from '~/src/domain/list'
import { createBuy, createDrive, createStop, driveLabel } from '~/src/domain/trip/factories'
import { reanchorIdleStops } from '~/src/domain/trip/reanchorIdleStops'
import { ridden } from '~/src/domain/trip/energy'
import type { DriveLine, StopLine, Trip, TripLine } from '~/src/domain/trip/types'

/**
 * The trip as a ledger: what happened, in order, and what it cost.
 *
 * Only money lives on this step. Who was in the car and whose card it was are
 * the next question, and mixing the two is what made the old screens long.
 */
const props = defineProps<{ trip: Trip }>()

const routing = useRouting()
const stopsDraft = ref(props.trip.routePoints.map((point) => point.label).join('\n'))
const note = ref('')
const looking = ref(false)

const unit = computed(() => unitLabelFor(props.trip.energyKind))
const perKm = computed(() => props.trip.pricing.mode === 'per-km')

const stops = computed(() =>
  stopsDraft.value
    .split(/\n|→|->|;/)
    .map((stop) => stop.trim())
    .filter(Boolean),
)

async function lookUpRoute() {
  note.value = ''
  if (stops.value.length < 2) {
    note.value = 'Two stops at least, one per line.'
    return
  }

  const points: GeoPoint[] = []
  for (const stop of stops.value) {
    const found = await routing.geocode(stop)
    const best = found?.results[0]
    if (!best) {
      note.value = `Could not find “${stop}”.`
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

  const drives = routeToSegments(plan, [])
  const purchases = props.trip.lines.filter((line) => line.kind === 'buy')
  // The stops are the user's own measurements, so a lookup re-anchors them to
  // the drives they happened between rather than dumping them at the end. That
  // needs the ledger in its existing order, which is where the anchors live.
  props.trip.lines = [...reanchorIdleStops(ridden(props.trip.lines), drives), ...purchases]
  note.value = `${drives.length} drives via ${plan.provider}.`
  looking.value = false
}

function add(line: TripLine, after = -1) {
  props.trip.lines = after < 0 ? [...props.trip.lines, line] : insertAfter(props.trip.lines, after, line)
}

function remove(id: string) {
  props.trip.lines = props.trip.lines.filter((line) => line.id !== id)
}

function move(index: number, by: number) {
  const next = [...props.trip.lines]
  const target = index + by
  if (target < 0 || target >= next.length) return
  const [line] = next.splice(index, 1)
  if (line) next.splice(target, 0, line)
  props.trip.lines = next
}

function relabel(line: DriveLine) {
  line.label = driveLabel(line.from, line.to)
}

/**
 * Only when a line disagrees with the trip. The select beside it already says
 * how it is priced, and repeating that under every drive is noise.
 */
function priceNote(line: TripLine): string {
  if (line.kind === 'buy' || !line.charge) return ''
  return line.charge.mode === 'money' ? 'priced by hand' : 'its own rate per km'
}

const chargeMajor = (line: DriveLine | StopLine) =>
  line.charge?.mode === 'money' ? toMajor(line.charge.amount) : 0

function setChargeMode(line: DriveLine | StopLine, mode: 'trip' | 'money' | 'per-km') {
  if (mode === 'trip') delete line.charge
  else if (mode === 'money') line.charge = { mode: 'money', amount: 0 }
  else line.charge = { mode: 'per-km', ratePerKm: 0 }
}

function setFlat(line: DriveLine | StopLine, major: number) {
  line.charge = { mode: 'money', amount: fromMajor(Number.isFinite(major) ? major : 0) }
}

function setRate(line: DriveLine | StopLine, major: number) {
  line.charge = { mode: 'per-km', ratePerKm: fromMajor(Number.isFinite(major) ? major : 0) }
}
</script>

<template>
  <section class="section" style="margin-top: 0" aria-label="The route">
    <div class="section__head">
      <div>
        <p class="eyebrow">Step 2</p>
        <h2>The route</h2>
      </div>
      <div class="button-row">
        <button type="button" class="button--quiet" @click="looking = !looking">
          {{ looking ? 'Close' : 'Look up a route' }}
        </button>
      </div>
    </div>

    <div v-if="looking" class="lookup">
      <label class="field field--wide">
        <span>Stops, one per line</span>
        <textarea v-model="stopsDraft" rows="4" placeholder="Šumperk&#10;Olomouc&#10;Milovice" />
      </label>
      <div class="button-row">
        <button type="button" :disabled="routing.busy.value" @click="lookUpRoute">
          {{ routing.busy.value ? 'Looking up…' : 'Look it up' }}
        </button>
      </div>
    </div>

    <!-- Outside the panel, which closes itself the moment a lookup lands. -->
    <p v-if="note || routing.error.value" class="hint" role="status">{{ note || routing.error.value }}</p>

    <TripPricing :trip="trip" />

    <ol v-if="trip.lines.length" class="ledger">
      <li
        v-for="(line, index) in trip.lines"
        :key="line.id"
        class="ledger__line"
        :class="`ledger__line--${line.kind}`"
        role="group"
        :aria-label="line.label || 'Untitled line'"
      >
        <div class="ledger__row">
          <span class="ledger__mark" aria-hidden="true">{{
            line.kind === 'drive' ? '→' : line.kind === 'stop' ? '⏸' : '＋'
          }}</span>

          <input
            v-if="line.kind === 'buy'"
            v-model="line.label"
            class="ledger__label"
            aria-label="What it was for"
          />
          <template v-else-if="line.kind === 'drive'">
            <input v-model="line.from" class="ledger__place" aria-label="From" @input="relabel(line)" />
            <input v-model="line.to" class="ledger__place" aria-label="To" @input="relabel(line)" />
            <input
              v-model.number="line.distanceKm"
              class="ledger__km"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.1"
              aria-label="Distance km"
            />
          </template>
          <template v-else>
            <input v-model="line.label" class="ledger__label" aria-label="What happened" />
            <input
              v-model.number="line.energy"
              class="ledger__km"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.1"
              :aria-label="`${unit} burned`"
            />
          </template>

          <AmountField v-if="line.kind === 'buy'" :trip="trip" :entry="line" />

          <span v-else class="ledger__price">
            <input
              v-if="line.charge?.mode === 'money'"
              :value="chargeMajor(line)"
              class="ledger__km"
              type="number"
              inputmode="decimal"
              min="0"
              step="1"
              :aria-label="`${trip.currency} it cost`"
              @input="setFlat(line, Number(($event.target as HTMLInputElement).value))"
            />
            <input
              v-else-if="line.charge?.mode === 'per-km'"
              :value="toMajor(line.charge.ratePerKm)"
              class="ledger__km"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.1"
              :aria-label="`${trip.currency} per km`"
              @input="setRate(line, Number(($event.target as HTMLInputElement).value))"
            />
            <select
              class="ledger__mode"
              :value="line.charge?.mode ?? 'trip'"
              :aria-label="`How ${line.label || 'this line'} is priced`"
              @change="setChargeMode(line, ($event.target as HTMLSelectElement).value as 'trip')"
            >
              <option value="trip">{{ perKm ? 'rate per km' : `by ${unit}` }}</option>
              <option value="money">flat price</option>
              <option value="per-km">own rate</option>
            </select>
          </span>

          <div class="ledger__tools">
            <button
              type="button"
              class="button--quiet"
              :aria-disabled="index === 0"
              :aria-label="`Move ${line.label} up`"
              @click="index === 0 ? null : move(index, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="button--quiet"
              :aria-disabled="index === trip.lines.length - 1"
              :aria-label="`Move ${line.label} down`"
              @click="move(index, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              class="button--danger"
              :aria-label="`Remove ${line.label}`"
              @click="remove(line.id)"
            >
              ✕
            </button>
          </div>
        </div>

        <p v-if="line.kind === 'buy'" class="ledger__note">
          <label class="toggle toggle--tiny" :class="{ 'is-on': line.funds === 'fuel' }">
            <input
              type="checkbox"
              :checked="line.funds === 'fuel'"
              @change="line.funds = line.funds === 'fuel' ? 'people' : 'fuel'"
            />
            <span>pays for the driving</span>
          </label>
          <input v-model="line.date" type="date" class="ledger__date" aria-label="Date" />
        </p>
        <p v-else-if="priceNote(line)" class="ledger__note">{{ priceNote(line) }}</p>
      </li>
    </ol>

    <p v-else class="hint">Nothing on the trip yet.</p>

    <div class="button-row">
      <button type="button" @click="add(createDrive('', ''))">Add a drive</button>
      <button type="button" class="button--quiet" @click="add(createStop())">Add a stop</button>
      <button type="button" class="button--quiet" @click="add(createBuy('', 0, 'people'))">
        Add a purchase
      </button>
    </div>
  </section>
</template>

<style scoped>
.lookup {
  margin-bottom: var(--s4);
  padding: var(--s3);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface-sunk);
}

.ledger {
  list-style: none;
  margin: var(--s3) 0;
  padding: 0;
}

.ledger__line {
  padding: var(--s2) 0;
  border-bottom: 1px solid var(--rule);
}

.ledger__line--buy {
  background: var(--surface-sunk);
}

.ledger__row {
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex-wrap: wrap;
}

.ledger__mark {
  width: 1.2em;
  color: var(--ink-faint);
  font-family: var(--font-figure);
}

.ledger__label {
  flex: 1 1 200px;
  min-width: 0;
}

.ledger__place {
  flex: 1 1 110px;
  min-width: 0;
}

.ledger__km {
  flex: 0 1 92px;
  min-width: 0;
}

.ledger__price {
  display: flex;
  gap: var(--s1);
  align-items: center;
}

.ledger__mode {
  flex: 0 1 auto;
  max-width: 120px;
}

.ledger__date {
  flex: 0 1 auto;
  max-width: 150px;
}

.ledger__tools {
  display: flex;
  gap: var(--s1);
  margin-left: auto;
}

.ledger__note {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding-left: calc(1.2em + var(--s2));
  color: var(--ink-faint);
  font-size: var(--t-small);
}
</style>
