<script setup lang="ts">
import { createId } from '~/src/domain/trip/factories'
import { decodeTripFromToken } from '~/src/domain/storage/urlCodec'

/**
 * Opens a shared link. The trip travels in the URL fragment, so it is decoded
 * here in the browser and saved as the reader's own copy — editing it never
 * touches whoever sent it.
 */
const store = useTripStore()
const router = useRouter()
const failed = ref(false)

onMounted(async () => {
  const trip = decodeTripFromToken(window.location.hash.replace(/^#/, ''))
  if (!trip) {
    failed.value = true
    return
  }

  const copy = { ...trip, id: createId('trip'), title: trip.title }
  await store.save(copy)
  await router.replace(`/trip/${copy.id}`)
})
</script>

<template>
  <div v-if="failed" class="empty">
    <p>That share link could not be read.</p>
    <p class="hint">It may have been cut short — links are long, and some chat apps trim them.</p>
    <NuxtLink to="/"><button type="button" class="button--quiet">Back to your trips</button></NuxtLink>
  </div>
  <p v-else class="hint">Opening the shared trip…</p>
</template>
