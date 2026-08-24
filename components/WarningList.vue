<script setup lang="ts">
defineProps<{ warnings: string[] }>()
</script>

<template>
  <div v-if="warnings.length" class="stack stack--tight" role="status">
    <p v-for="warning in warnings" :key="warning" class="notice">
      <span class="notice__mark">!</span>
      <span>{{ warning }}</span>
    </p>
  </div>
</template>
