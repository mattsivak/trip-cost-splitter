import { calculateTrip } from '~/src/domain/trip/calculateTrip'
import type { Trip } from '~/src/domain/trip/types'

/**
 * One trip, loaded and kept saved.
 *
 * Saving is debounced because the wizard writes on every keystroke and every
 * toggle; the user should never have to think about it.
 */
export function useTrip(tripId: MaybeRefOrGetter<string>) {
  const store = useTripStore()
  const trip = ref<Trip | null>(null)
  const status = ref<'loading' | 'ready' | 'missing'>('loading')

  const result = computed(() => (trip.value ? calculateTrip(trip.value) : null))

  /** Set while a load is settling, so hydration does not look like an edit. */
  let hydrating = false

  async function load() {
    status.value = 'loading'
    hydrating = true
    const loaded = await store.load(toValue(tripId))
    trip.value = loaded
    status.value = loaded ? 'ready' : 'missing'
    await nextTick()
    hydrating = false
  }

  // Longer than it was when this wrote to localStorage: each save is now a
  // request, and nobody needs one per keystroke.
  const SAVE_DELAY_MS = 800

  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function saveNow() {
    if (trip.value) void store.save(trip.value)
  }

  onMounted(load)

  watch(
    trip,
    () => {
      if (hydrating || status.value !== 'ready' || !trip.value) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(saveNow, SAVE_DELAY_MS)
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    clearTimeout(saveTimer)
    saveNow()
  })

  return { trip, result, status, reload: load, saveNow }
}
