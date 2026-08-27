<script setup lang="ts">
import { describeAllocation } from '~/src/domain/trip/overhead'
import type { OverheadCost, Receipt, Trip } from '~/src/domain/trip/types'

/**
 * One thing somebody paid for.
 *
 * Fuel and tolls used to be two lists with asymmetric powers — a receipt took a
 * date and a currency but could not say who it was for; a toll said who it was
 * for but took no date, so it could never have its own rate. They are one thing
 * with one kind flag now, and the two questions that used to be separate
 * controls are one sentence you tap: who paid it, and how it is split.
 */
const props = defineProps<{ trip: Trip; entry: Receipt | OverheadCost; kind: 'fuel' | 'extra' }>()

const open = ref(false)

function nameOf(personId: string | undefined): string {
  return props.trip.people.find((person) => person.id === personId)?.name ?? ''
}

/** Nothing stored means the driver, and the driver is what the pills show. */
const payer = computed(() => props.entry.paidBy ?? props.trip.driverId ?? '')

const payerLine = computed(() => {
  const name = nameOf(payer.value)
  return name ? `${name} paid` : 'Nobody has paid this yet'
})

/**
 * Fuel is not split by a picker: it funds the pool and is charged by who was in
 * the car for each leg, which is the whole point of the app. Saying so on the
 * row is what stops it looking like an extra that lost its control.
 */
const splitLine = computed(() => {
  if (props.kind === 'fuel') return 'Fuel for the whole trip'
  const cost = props.entry as OverheadCost
  if (cost.allocation.type === 'fixed') return 'Set for each person'
  const who = describeAllocation(cost, props.trip.people)
  return who === 'nobody' ? 'Charged to nobody' : `Split evenly between ${who}`
})

function setPayer(personId: string) {
  if (personId && personId !== props.trip.driverId) props.entry.paidBy = personId
  else delete props.entry.paidBy
}

/**
 * Moving between the two kinds is moving between the two arrays. Everything
 * else about the expense survives the move; only the allocation is meaningless
 * on one side and required on the other.
 */
function setKind(kind: 'fuel' | 'extra') {
  if (kind === props.kind) return
  const { id, label, amount, foreign, paidBy, date } = props.entry as Receipt & OverheadCost
  const carried = { id, label, amount, ...(foreign ? { foreign } : {}), ...(paidBy ? { paidBy } : {}) }
  const dated = date ? { ...carried, date } : carried

  if (kind === 'extra') {
    props.trip.receipts = props.trip.receipts.filter((entry) => entry.id !== id)
    props.trip.overheadCosts = [...props.trip.overheadCosts, { ...dated, allocation: { type: 'even' } }]
    return
  }

  props.trip.overheadCosts = props.trip.overheadCosts.filter((entry) => entry.id !== id)
  props.trip.receipts = [...props.trip.receipts, dated]
}

function remove() {
  if (props.kind === 'fuel') {
    props.trip.receipts = props.trip.receipts.filter((entry) => entry.id !== props.entry.id)
    return
  }
  props.trip.overheadCosts = props.trip.overheadCosts.filter((entry) => entry.id !== props.entry.id)
}
</script>

<template>
  <!--
    A named group, so the controls inside it — two radio sets and a person
    picker — belong to something a screen reader can announce, and so a test can
    ask for the expense by name rather than by position.
  -->
  <div
    class="expense"
    role="group"
    :aria-label="entry.label || 'Untitled expense'"
    :class="{ 'is-open': open }"
  >
    <div class="expense__line">
      <input v-model="entry.label" class="expense__label" aria-label="What it was for" />
      <AmountField :trip="trip" :entry="entry" />
      <input v-model="entry.date" type="date" class="expense__date" aria-label="Date" />
    </div>

    <!--
      The two questions that were two controls. Shut, they are a sentence you
      can read at a glance; open, they are the pills that answer them.
    -->
    <button type="button" class="expense__sentence" :aria-expanded="open" @click="open = !open">
      <span class="expense__split">{{ splitLine }}</span>
      <span class="expense__dot" aria-hidden="true">·</span>
      <span class="expense__payer">{{ payerLine }}</span>
    </button>

    <div v-if="open" class="expense__panel stack stack--tight">
      <div>
        <p class="eyebrow">What kind</p>
        <div class="toggles">
          <label class="toggle" :class="{ 'is-on': kind === 'fuel' }">
            <input
              type="radio"
              :name="`kind-${entry.id}`"
              :checked="kind === 'fuel'"
              @change="setKind('fuel')"
            />
            <span>Fuel</span>
          </label>
          <label class="toggle" :class="{ 'is-on': kind === 'extra' }">
            <input
              type="radio"
              :name="`kind-${entry.id}`"
              :checked="kind === 'extra'"
              @change="setKind('extra')"
            />
            <span>Extra</span>
          </label>
        </div>
        <p class="hint">
          {{
            kind === 'fuel'
              ? 'Counted as fuel for the whole trip, and split by who was in the car for each leg.'
              : 'Tolls, parking, a ferry — split between the people it was for.'
          }}
        </p>
      </div>

      <div>
        <p class="eyebrow">Who paid</p>
        <div class="toggles expense__payers">
          <label
            v-for="person in trip.people"
            :key="person.id"
            class="toggle"
            :class="{ 'is-on': person.id === payer }"
          >
            <input
              type="radio"
              :name="`payer-${entry.id}`"
              :checked="person.id === payer"
              @change="setPayer(person.id)"
            />
            <span>{{ person.name }}{{ person.id === trip.driverId ? ' · driving' : '' }}</span>
          </label>
        </div>
      </div>

      <div v-if="kind === 'extra'" class="expense__who">
        <OverheadSplit :trip="trip" :cost="entry as OverheadCost" embedded />
      </div>

      <div class="button-row">
        <button type="button" class="button--danger" @click="remove">Remove</button>
        <button type="button" class="button--quiet" @click="open = false">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expense {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  padding: var(--s3) 0;
  border-bottom: 1px solid var(--rule);
}

.expense.is-open {
  background: var(--surface);
  padding: var(--s3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
}

.expense__line {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--s2);
}

.expense__label {
  flex: 1 1 160px;
  min-width: 0;
}

.expense__date {
  flex: 0 1 auto;
  max-width: 150px;
}

/* A sentence, not a control panel: quiet until you go looking for it. */
.expense__sentence {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s1);
  align-items: baseline;
  text-align: left;
  padding: var(--s1) 0;
  border: 0;
  background: none;
  color: var(--ink-soft);
  font-family: inherit;
  font-size: var(--t-small);
  font-weight: 400;
  cursor: pointer;
}

.expense__sentence:hover .expense__split,
.expense__sentence:hover .expense__payer {
  border-bottom-color: var(--accent);
  color: var(--ink);
}

.expense__split,
.expense__payer {
  border-bottom: 1px dashed var(--rule-strong);
}

.expense__dot {
  color: var(--ink-faint);
}

.expense__panel {
  margin-top: var(--s2);
  padding-top: var(--s3);
  border-top: 1px solid var(--rule);
}
</style>
