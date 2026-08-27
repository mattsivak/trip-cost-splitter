<script setup lang="ts">
import type { OverheadCost, Receipt, Trip } from '~/src/domain/trip/types'

/**
 * Whose money this was.
 *
 * Stored as nothing at all when it was the driver's — the assumption the whole
 * app ran on before this field existed, and the right default still. But the
 * list must not show that: an option meaning "the driver" beside an option
 * named after the driver is the same person offered twice, which is exactly
 * how this control came to be unreadable.
 */
const props = defineProps<{ trip: Trip; entry: Receipt | OverheadCost }>()

/** Nothing stored means the driver, so the driver is what the list shows. */
const chosen = computed(() => props.entry.paidBy ?? props.trip.driverId ?? '')

function set(personId: string) {
  if (personId && personId !== props.trip.driverId) props.entry.paidBy = personId
  else delete props.entry.paidBy
}
</script>

<template>
  <select
    v-if="trip.people.length > 1"
    class="entry-row__payer"
    aria-label="Paid by"
    :value="chosen"
    @change="set(($event.target as HTMLSelectElement).value)"
  >
    <option v-if="!trip.driverId" value="">Nobody yet</option>
    <option v-for="person in trip.people" :key="person.id" :value="person.id">
      {{ person.name }}{{ person.id === trip.driverId ? ' (driver)' : '' }}
    </option>
  </select>
</template>

<style scoped>
.entry-row__payer {
  flex: 0 1 auto;
  max-width: 170px;
}
</style>
