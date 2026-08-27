<script setup lang="ts">
const { state, retry } = useSaveState()
</script>

<template>
  <!--
    Always shown once a trip is open, not only while a request is in flight: on
    a phone in a tunnel the interesting state is the one that persists.
  -->
  <p v-if="state !== 'off'" class="save-state" :class="`save-state--${state}`" role="status">
    <template v-if="state === 'saving'">
      <span class="save-state__mark" aria-hidden="true">◌</span>
      Saving…
    </template>
    <template v-else-if="state === 'saved'">
      <span class="save-state__mark" aria-hidden="true">✓</span>
      Saved
    </template>
    <template v-else>
      <span class="save-state__mark" aria-hidden="true">⚠</span>
      Not saved
      <button type="button" class="save-state__retry" @click="retry">Retry</button>
    </template>
  </p>
</template>
