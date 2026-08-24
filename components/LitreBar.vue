<script setup lang="ts">
import { formatEnergy, type EnergyKind } from '~/src/domain/pricing/energyKind'
/**
 * The signature element: one segment's energy, drawn as the people sharing it.
 * Toggling somebody on or off visibly re-cuts the bar, which is the whole
 * argument the app is making — a share is a slice of the fuel you were there
 * for, not an abstract number in a table.
 */
const props = defineProps<{
  slices: Array<{ id: string; name: string; energy: number; isDriver: boolean }>
  energyKind: EnergyKind
  emptyLabel?: string
}>()

const total = computed(() => props.slices.reduce((sum, slice) => sum + slice.energy, 0))
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
      :style="{ flexGrow: slice.energy }"
      :title="`${slice.name} · ${formatEnergy(slice.energy, energyKind)}`"
    >
      {{ slice.name }}
    </span>
  </div>
</template>
