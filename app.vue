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
  <div class="shell">
    <header class="masthead">
      <NuxtLink to="/" class="masthead__mark">
        <strong>Trip Cost Splitter</strong>
        <span class="eyebrow">fuel, split by who was in the car</span>
      </NuxtLink>
    </header>

    <NuxtPage />
  </div>
</template>
