<script setup lang="ts">
const { mode, install, showIosHint } = useInstall()
</script>

<template>
  <div v-if="mode !== 'none'" class="install">
    <button
      type="button"
      class="install__button"
      :aria-expanded="mode === 'ios' ? showIosHint : undefined"
      @click="install"
    >
      Install
    </button>

    <p v-if="mode === 'ios' && showIosHint" class="install__hint">
      Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
    </p>
  </div>
</template>
