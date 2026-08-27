<script setup lang="ts">
import { createOverhead, createReceipt } from '~/src/domain/trip/factories'
import type { Trip } from '~/src/domain/trip/types'

/**
 * Everything anybody paid for, in one list.
 *
 * The split between fuel and extras is real — one funds the pool the legs are
 * charged against, the other is divided between the people it was for — but it
 * is the calculator's business. Making the user file each expense into one of
 * two forms with different fields was making them do the filing.
 */
const props = defineProps<{ trip: Trip }>()

const expenses = computed(() => [
  ...props.trip.receipts.map((entry) => ({ kind: 'fuel' as const, entry })),
  ...props.trip.overheadCosts.map((entry) => ({ kind: 'extra' as const, entry })),
])

/** Fuel is the common case on a trip about fuel, so that is what you get. */
function add() {
  props.trip.receipts = [...props.trip.receipts, createReceipt('')]
}

/** Kept so the factory's shape stays in one place, used by the row on a switch. */
void createOverhead
</script>

<template>
  <div class="stack stack--tight">
    <p class="eyebrow">What was spent</p>

    <div v-if="!expenses.length" class="empty">
      <p>Nothing spent yet.</p>
      <p class="hint">Fuel, tolls, the ferry — anything anybody put money down for.</p>
    </div>

    <ExpenseRow
      v-for="expense in expenses"
      :key="expense.entry.id"
      :trip="trip"
      :entry="expense.entry"
      :kind="expense.kind"
    />

    <div class="button-row">
      <button type="button" @click="add">Add an expense</button>
    </div>

    <p class="hint">
      Fuel pays for the driving and is split by who was in the car for each leg. An extra — a toll, a
      vignette, a ferry — is split between the people it was for, and can be set to exact amounts. Paid
      abroad? Change the currency and that day's rate is filled in for you.
    </p>
  </div>
</template>
