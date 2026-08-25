<script setup lang="ts">
/**
 * The signature element: one segment's energy, drawn as the people sharing it.
 * Toggling somebody on or off visibly re-cuts the bar, which is the whole
 * argument the app is making — a share is a slice of the fuel you were there
 * for, not an abstract number in a table.
 *
 * The bar itself knows nothing about units. A trip priced by the kilometre has
 * no litres to draw, so the caller decides what a slice is worth and hands
 * over a plain `weight` with the `label` to show on hover.
 */
const props = defineProps<{
  slices: Array<{ id: string; name: string; weight: number; label: string; isDriver: boolean }>
  emptyLabel?: string
}>()

const total = computed(() => props.slices.reduce((sum, slice) => sum + slice.weight, 0))
</script>

<template>
  <div
    class="litrebar"
    role="img"
    :aria-label="
      slices.length
        ? `Fuel split between ${slices.map((slice) => slice.name).join(', ')}`
        : (emptyLabel ?? 'Nobody assigned')
    "
  >
    <span v-if="!slices.length || total === 0" class="litrebar__empty">
      {{ emptyLabel ?? 'Nobody assigned yet' }}
    </span>
    <span
      v-for="slice in slices"
      v-else
      :key="slice.id"
      class="litrebar__slice"
      :class="{ 'litrebar__slice--driver': slice.isDriver }"
      :style="{ flexGrow: slice.weight }"
      :title="`${slice.name} · ${slice.label}`"
    >
      {{ slice.name }}
    </span>
  </div>
</template>
