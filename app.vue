<script setup lang="ts">
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
      <NuxtLink to="/" class="masthead__mark">
        <strong>Trip Cost Splitter</strong>
        <span class="eyebrow">fuel, split by who was in the car</span>
      </NuxtLink>

      <div class="masthead__tools">
        <SaveState />
        <ThemeToggle />
      </div>
    </div>
  </header>

  <div class="shell">
    <NuxtPage />
  </div>
</template>
