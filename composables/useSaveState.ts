import { ref } from 'vue'

/**
 * `off` is for the pages that do not autosave — the trip list and the
 * read-only share page — so the masthead stays quiet there.
 */
export type SaveState = 'off' | 'saving' | 'saved' | 'failed'

/** A save, ready to be run again if the first go does not land. */
type Save = () => Promise<unknown>

// Module-level, like the theme: the autosave lives on the page and the badge
// lives in the masthead, and they need to be looking at the same thing.
const state = ref<SaveState>('off')

/** The save that failed, kept so Retry has something to run. */
let lastFailed: Save | null = null

/**
 * Which attempt is allowed to speak. Edits keep arriving while a request is in
 * flight, so a slow save can settle after a newer one; only the newest may set
 * the state, or a stale failure would report over a save that has since worked.
 */
let current = 0

/**
 * Whether the trip in front of you is saved, and a way back if it is not.
 *
 * Every edit is a request, and this app is used in cars and tunnels. Without
 * this a dropped save is silent: the wizard looks the same either way.
 */
export function useSaveState() {
  async function attempt(save: Save) {
    const mine = ++current
    state.value = 'saving'

    try {
      await save()
      if (mine !== current) return
      lastFailed = null
      state.value = 'saved'
    } catch {
      if (mine !== current) return
      lastFailed = save
      state.value = 'failed'
    }
  }

  /**
   * The last save, made as the page closes. A save that lands needs no report
   * — the trip being left is not news — but one that fails has to keep its
   * badge, because nothing else on the next page will mention it.
   */
  async function finish(save: Save) {
    await attempt(save)
    if (state.value === 'saved') reset()
  }

  async function retry() {
    if (!lastFailed) return
    await attempt(lastFailed)
  }

  function reset() {
    current += 1
    lastFailed = null
    state.value = 'off'
  }

  return { state, attempt, finish, retry, reset }
}
