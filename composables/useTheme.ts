import { ref } from 'vue'

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'trip-cost-splitter:theme'

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark'
}

/**
 * Light or dark, chosen by the system unless the reader says otherwise.
 *
 * The stored value is applied by an inline script in the document head before
 * anything paints — see nuxt.config — so this only has to keep the two in step
 * afterwards. `system` removes the attribute entirely rather than resolving it
 * here, which lets the media query keep doing the work if the OS setting
 * changes while the page is open.
 */
const choice = ref<ThemeChoice>('system')

export function useTheme() {
  onMounted(() => {
    choice.value = readStored() ?? 'system'
  })

  function setTheme(next: ThemeChoice) {
    choice.value = next
    apply(next)

    try {
      if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY)
      else window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // A browser refusing storage is not a reason to refuse the theme.
    }
  }

  return { choice, setTheme }
}

function readStored(): ThemeChoice | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeChoice(stored) ? stored : null
  } catch {
    return null
  }
}

function apply(next: ThemeChoice) {
  const root = document.documentElement
  if (next === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', next)
}
