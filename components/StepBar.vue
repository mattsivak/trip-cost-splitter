<script setup lang="ts">
/**
 * Four steps, four words. The last rail carried a number, a name and a
 * sentence of explanation each, which is three lines of furniture per step
 * before you reach the trip.
 */
const model = defineModel<number>({ required: true })

const steps = ['People', 'Route', 'Who pays', 'Settle up']
</script>

<template>
  <nav class="steps" aria-label="Steps">
    <button
      v-for="(step, index) in steps"
      :key="step"
      type="button"
      class="steps__step"
      :class="{ 'is-on': model === index }"
      :aria-current="model === index ? 'step' : undefined"
      @click="model = index"
    >
      <span class="steps__index">{{ index + 1 }}</span>
      {{ step }}
    </button>
  </nav>
</template>

<style scoped>
.steps {
  display: flex;
  gap: var(--s1);
  margin-bottom: var(--s4);
  border-bottom: 1px solid var(--rule);
}

.steps__step {
  flex: 1 1 auto;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--s2);
  padding: var(--s3) var(--s2);
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--ink-faint);
  font-weight: 600;
  font-size: var(--t-small);
}

.steps__step:hover {
  color: var(--ink);
  background: var(--hover);
}

.steps__step.is-on {
  color: var(--ink);
  border-bottom-color: var(--accent);
}

.steps__index {
  font-family: var(--font-figure);
  font-size: var(--t-micro);
  color: var(--ink-faint);
}
</style>
