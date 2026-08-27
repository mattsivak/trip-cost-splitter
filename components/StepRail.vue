<script setup lang="ts">
/**
 * The steps are numbered because the order is real: you cannot assign people
 * to a drive that does not exist yet. The numbers carry information, so they
 * earn their place.
 */
const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const steps = [
  { name: 'Route', hint: 'Where the car went' },
  { name: 'People', hint: 'Who came along' },
  { name: 'Assign', hint: 'Who was in the car for each leg' },
  { name: 'Split', hint: 'What everyone owes' },
  { name: 'Collect', hint: 'Getting it back' },
]
</script>

<template>
  <nav class="rail" aria-label="Steps">
    <button
      v-for="(step, index) in steps"
      :key="step.name"
      type="button"
      class="rail__step"
      :class="{ 'is-active': props.modelValue === index }"
      :aria-current="props.modelValue === index ? 'step' : undefined"
      @click="emit('update:modelValue', index)"
    >
      <span class="rail__index">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="rail__name">{{ step.name }}</span>
      <span class="rail__hint">{{ step.hint }}</span>
    </button>
  </nav>
</template>
