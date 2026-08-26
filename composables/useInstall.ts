import { computed, ref } from 'vue'

/**
 * The offer to install, and what shape it can take.
 *
 * Chrome hands us a `beforeinstallprompt` event we can fire on a click. iOS
 * Safari hands us nothing at all — installing there is Share → Add to Home
 * Screen, done by hand — so the only useful thing we can do is say so. Anywhere
 * else, and once the app is installed, the offer stays out of the way.
 */
export type InstallMode = 'none' | 'prompt' | 'ios'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function installMode(input: {
  hasPrompt: boolean
  isStandalone: boolean
  userAgent: string
}): InstallMode {
  // Already installed: the window it opened in is the answer.
  if (input.isStandalone) return 'none'
  if (input.hasPrompt) return 'prompt'
  return isIosSafari(input.userAgent) ? 'ios' : 'none'
}

/**
 * iPad has reported itself as a Mac since iPadOS 13, so the touch check is not
 * decoration. Chrome and Firefox on iOS wrap WebKit but cannot add to the home
 * screen, so their tokens rule the hint out.
 */
export function isIosSafari(userAgent: string): boolean {
  const ios = /iPhone|iPod|iPad/.test(userAgent)
  if (!ios) return false
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
}

export function useInstall() {
  const deferred = ref<BeforeInstallPromptEvent | null>(null)
  const standalone = ref(true)
  const userAgent = ref('')
  const showIosHint = ref(false)

  onMounted(() => {
    standalone.value = isStandalone()
    userAgent.value = navigator.userAgent

    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', onInstalled)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', capture)
    window.removeEventListener('appinstalled', onInstalled)
  })

  function capture(event: Event) {
    // Holding the event back is what lets the offer live in the masthead
    // instead of in whatever bar the browser would have shown.
    event.preventDefault()
    deferred.value = event as BeforeInstallPromptEvent
  }

  function onInstalled() {
    deferred.value = null
    standalone.value = true
  }

  const mode = computed(() =>
    installMode({
      hasPrompt: deferred.value !== null,
      isStandalone: standalone.value,
      userAgent: userAgent.value,
    }),
  )

  async function install() {
    if (mode.value === 'ios') {
      showIosHint.value = !showIosHint.value
      return
    }

    const event = deferred.value
    if (!event) return

    // The event is single-use: whatever the answer, it cannot be fired again.
    deferred.value = null
    await event.prompt()
  }

  return { mode, install, showIosHint }
}

function isStandalone(): boolean {
  const displayMode = window.matchMedia('(display-mode: standalone)').matches
  // iOS predates the media query and still answers only to this.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return displayMode || iosStandalone
}
