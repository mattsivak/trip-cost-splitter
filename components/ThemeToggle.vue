<script setup lang="ts">
import type { ThemeChoice } from '~/composables/useTheme'

const { choice, setTheme } = useTheme()

const options: Array<{ value: ThemeChoice; label: string; title: string }> = [
  { value: 'system', label: 'Auto', title: 'Follow the system setting' },
  { value: 'light', label: 'Light', title: 'Always light' },
  { value: 'dark', label: 'Dark', title: 'Always dark' },
]
</script>

<template>
  <div class="theme" role="group" aria-label="Colour theme">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="theme__option"
      :class="{ 'is-on': choice === option.value }"
      :aria-pressed="choice === option.value"
      :title="option.title"
      @click="setTheme(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
