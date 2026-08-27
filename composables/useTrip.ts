import { calculateTrip } from '~/src/domain/trip/calculateTrip'
import type { Trip } from '~/src/domain/trip/types'

/**
 * One trip, loaded and kept saved.
 *
 * Saving is debounced because the wizard writes on every keystroke and every
 * toggle; the user should never have to think about it.
 */
export function useTrip(tripId: MaybeRefOrGetter<string>, openKey?: MaybeRefOrGetter<string>) {
  const store = useTripStore()
  const saveState = useSaveState()
  const trip = ref<Trip | null>(null)
  const status = ref<'loading' | 'ready' | 'missing'>('loading')

  const result = computed(() => (trip.value ? calculateTrip(trip.value) : null))

  /** Set while a load is settling, so hydration does not look like an edit. */
  let hydrating = false

  async function load() {
    status.value = 'loading'
    hydrating = true

    // A key in the address means an edit link: this browser may never have
    // seen the trip, and the server decides whether the key really opens it.
    const key = openKey ? toValue(openKey).trim() : ''
    const loaded = key ? await store.adopt(toValue(tripId), key) : await store.load(toValue(tripId))

    // Once it is in the index the plain address works, so the key stops riding
    // in the bar where it can be shoulder-read or pasted on by accident.
    if (loaded && key && import.meta.client) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    trip.value = loaded
    status.value = loaded ? 'ready' : 'missing'
    await nextTick()
    hydrating = false
  }

  // Longer than it was when this wrote to localStorage: each save is now a
  // request, and nobody needs one per keystroke.
  const SAVE_DELAY_MS = 800

  let saveTimer: ReturnType<typeof setTimeout> | undefined

  /** An edit that no finished save has covered yet. */
  let unsaved = false

  function saveNow() {
    const editing = trip.value
    if (!editing) return
    unsaved = false
    // The same object is handed to the retry, and it is the one the wizard
    // mutates, so a retry sends whatever the trip looks like by then.
    return saveState.attempt(() => store.save(editing))
  }

  onMounted(load)

  watch(
    trip,
    () => {
      if (hydrating || status.value !== 'ready' || !trip.value) return
      unsaved = true
      clearTimeout(saveTimer)
      saveTimer = setTimeout(saveNow, SAVE_DELAY_MS)
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    clearTimeout(saveTimer)
    // The badge belongs to the trip; the list behind it has nothing to save.
    saveState.reset()

    const editing = trip.value
    if (!unsaved || !editing) return
    void saveState.finish(() => store.save(editing))
  })

  return { trip, result, status, reload: load, saveNow }
}
