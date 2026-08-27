<script setup lang="ts">
/**
 * The masthead is the owner's. Somebody who opened a payment link is not
 * editing anything and has no trips of their own here, so the save badge and
 * the way back into the app both come off their page.
 */
const route = useRoute()
const shared = computed(() => route.path.startsWith('/view/'))

useHead({
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    },
  ],
})
</script>

<template>
  <!-- Outside the shell so the sticky bar can be as wide as the window. -->
  <header class="masthead">
    <div class="masthead__inner">
      <NuxtLink v-if="!shared" to="/" class="masthead__mark">
        <strong>Trip Cost Splitter</strong>
        <span class="eyebrow">fuel, split by who was in the car</span>
      </NuxtLink>
      <span v-else class="masthead__mark">
        <strong>Trip Cost Splitter</strong>
        <span class="eyebrow">fuel, split by who was in the car</span>
      </span>

      <div class="masthead__tools">
        <SaveState v-if="!shared" />
        <ThemeToggle />
      </div>
    </div>
  </header>

  <div class="shell">
    <NuxtPage />
  </div>
</template>
