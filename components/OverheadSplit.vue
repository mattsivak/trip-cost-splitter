<script setup lang="ts">
import { allocate, fromMajor, sumMoney, toMajor } from '~/src/domain/money/money'
import { describeAllocation } from '~/src/domain/trip/overhead'
import type { PersonId, Trip } from '~/src/domain/trip/types'

/**
 * Who one non-fuel cost is actually for.
 *
 * The domain has always been able to charge a cost to a chosen few, or to split
 * it into the exact amounts each person owes; nothing in the wizard reached
 * either. This is that control, and it is deliberately shut by default — most
 * tolls really are shared evenly, and the common case should stay a single line
 * of text rather than a form.
 */
const props = defineProps<{ trip: Trip; cost: Trip['overheadCosts'][number] }>()

const { exact } = useMoney(() => props.trip.currency)

const open = ref(false)

const everyone = computed(() => props.trip.people.map((person) => person.id))

/** Who an even split is aimed at. An absent list has always meant everyone. */
const targets = computed<PersonId[]>(() =>
  props.cost.allocation.type === 'even'
    ? (props.cost.allocation.personIds ?? everyone.value)
    : Object.keys(props.cost.allocation.amounts),
)

/** What the control says about itself while shut. */
const summary = computed(() => {
  const { allocation } = props.cost
  if (allocation.type === 'fixed') {
    return `Set for each person, ${exact(sumMoney(Object.values(allocation.amounts)))} in all`
  }
  const who = describeAllocation(props.cost, props.trip.people)
  return who === 'nobody' ? 'Charged to nobody' : `Split evenly between ${who}`
})

/** Each person's slice of an even split, shown inside their own pill. */
const shares = computed<Record<PersonId, string>>(() => {
  if (props.cost.allocation.type !== 'even' || !targets.value.length) return {}
  const parts = allocate(
    props.cost.amount,
    targets.value.map(() => 1),
  )
  return Object.fromEntries(targets.value.map((personId, index) => [personId, exact(parts[index] ?? 0)]))
})

/**
 * A list covering everybody is stored as no list at all, so a trip that never
 * touched this control keeps parsing exactly as it did before it existed.
 */
function setTargets(personIds: PersonId[]) {
  const kept = everyone.value.filter((personId) => personIds.includes(personId))
  props.cost.allocation =
    kept.length === everyone.value.length ? { type: 'even' } : { type: 'even', personIds: kept }
}

function toggle(personId: PersonId) {
  const current = targets.value
  setTargets(current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId])
}

function setAll(all: boolean) {
  setTargets(all ? everyone.value : [])
}

/**
 * Switching to per-person amounts seeds them with the even split, so the change
 * is a starting point rather than a cost that suddenly adds up to nothing.
 */
function setMode(mode: 'even' | 'fixed') {
  if (mode === 'even') {
    props.cost.allocation = { type: 'even' }
    return
  }

  const people = targets.value.length ? targets.value : everyone.value
  const parts = allocate(
    props.cost.amount,
    people.map(() => 1),
  )
  props.cost.allocation = {
    type: 'fixed',
    amounts: Object.fromEntries(people.map((personId, index) => [personId, parts[index] ?? 0])),
  }
}

function majorFor(personId: PersonId): number {
  const { allocation } = props.cost
  return allocation.type === 'fixed' ? toMajor(allocation.amounts[personId] ?? 0) : 0
}

function setAmount(personId: PersonId, value: string) {
  const { allocation } = props.cost
  if (allocation.type !== 'fixed') return
  const asNumber = Number(value)
  allocation.amounts = {
    ...allocation.amounts,
    [personId]: fromMajor(Number.isFinite(asNumber) ? asNumber : 0),
  }
}
</script>

<template>
  <section class="overhead__split" :aria-label="`How ${cost.label || 'this cost'} is split`">
    <p class="overhead__summary">
      <span class="hint">{{ summary }}</span>
      <button type="button" class="button--quiet" @click="open = !open">
        {{ open ? 'Done' : 'Change' }}
      </button>
    </p>

    <div v-if="open" class="overhead__panel stack stack--tight">
      <div class="toggles">
        <label class="toggle" :class="{ 'is-on': cost.allocation.type === 'even' }">
          <input
            type="radio"
            :name="`allocation-${cost.id}`"
            :checked="cost.allocation.type === 'even'"
            @change="setMode('even')"
          />
          <span>Split evenly</span>
        </label>
        <label class="toggle" :class="{ 'is-on': cost.allocation.type === 'fixed' }">
          <input
            type="radio"
            :name="`allocation-${cost.id}`"
            :checked="cost.allocation.type === 'fixed'"
            @change="setMode('fixed')"
          />
          <span>Set each amount</span>
        </label>
      </div>

      <template v-if="cost.allocation.type === 'even'">
        <OccupantToggles
          :people="trip.people"
          :occupant-ids="targets"
          :driver-id="trip.driverId"
          :shares="shares"
          @toggle="toggle"
        />
        <div class="button-row">
          <button type="button" class="button--quiet" @click="setAll(true)">Everyone</button>
          <button type="button" class="button--quiet" @click="setAll(false)">Nobody</button>
        </div>
      </template>

      <div v-else class="overhead__amounts">
        <label v-for="person in trip.people" :key="person.id" class="field">
          <span>{{ person.name }}</span>
          <input
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            :aria-label="`Amount for ${person.name}`"
            :value="majorFor(person.id)"
            @input="setAmount(person.id, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Shut, this is one line of text with a way in. It should not look like a form
   until somebody has said they want one. */
.overhead__summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
}

.overhead__panel {
  padding: 12px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface-sunk);
}

.overhead__amounts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
</style>
