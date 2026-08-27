<script setup lang="ts">
import { readViewFragment } from '~/src/domain/storage/urlCodec'
import { calculateTrip } from '~/src/domain/trip/calculateTrip'
import type { Trip } from '~/src/domain/trip/types'

/**
 * The link you send the group.
 *
 * Read-only, and deliberately not the wizard: nobody receiving a "you owe 804
 * Kč" message should be handed eight editable distance fields. The one thing
 * they can change is whether they have paid.
 *
 * The view key rides in the fragment, so it never reaches a server log or a
 * Referer header. It is read here and sent explicitly with each request.
 */
const route = useRoute()
const tripId = computed(() => String(route.params.id ?? ''))

const trip = ref<Trip | null>(null)
const status = ref<'loading' | 'ready' | 'missing' | 'unreachable'>('loading')
const viewKey = ref('')

/**
 * Which of the names on this trip is holding the phone. It rides in the link
 * the driver copies for them; failing that they say so once and this browser
 * remembers, because a page that leads with "you owe 804" beats a table of
 * eight names sorted by amount with nothing marking which line is yours.
 */
const readerId = ref('')

const rememberKey = computed(() => `trip-cost-splitter:reader:${tripId.value}`)

const reader = computed(
  () => result.value?.people.find((person) => person.personId === readerId.value) ?? null,
)

const others = computed(
  () => result.value?.people.filter((person) => person.personId !== readerId.value) ?? [],
)

function iAm(personId: string) {
  readerId.value = personId
  try {
    window.localStorage.setItem(rememberKey.value, personId)
  } catch {
    // A browser refusing storage costs the memory, not the page.
  }
}
const busyPersonId = ref<string | null>(null)
const failed = ref('')

const result = computed(() => (trip.value ? calculateTrip(trip.value) : null))

const { money } = useMoney(() => trip.value?.currency ?? '')

const path = computed(() => `/api/trips/${encodeURIComponent(tripId.value)}`)

async function open() {
  if (!viewKey.value) {
    status.value = 'missing'
    return
  }

  status.value = 'loading'
  try {
    const answer = await $fetch<{ trip: Trip }>(path.value as string, { query: { key: viewKey.value } })
    trip.value = answer.trip
    status.value = 'ready'
  } catch (error) {
    // A link that does not open anything is a different thing from a link
    // nobody could ask about, and only one of them is worth giving up on.
    const status404 = error as { statusCode?: number; response?: { status?: number } }
    const gone = status404?.statusCode === 404 || status404?.response?.status === 404
    status.value = gone ? 'missing' : 'unreachable'
  }
}

onMounted(() => {
  const fragment = readViewFragment(window.location.hash)
  viewKey.value = fragment.key
  readerId.value = fragment.personId
  if (!readerId.value) {
    try {
      readerId.value = window.localStorage.getItem(rememberKey.value) ?? ''
    } catch {
      readerId.value = ''
    }
  }
  void open()
})

async function togglePaid(personId: string, paid: boolean) {
  if (!trip.value) return

  busyPersonId.value = personId
  failed.value = ''
  try {
    const answer = await $fetch<{ paidAt: Record<string, string> }>(`${path.value}/paid` as string, {
      method: 'POST',
      body: { key: viewKey.value, personId, paid },
    })
    trip.value = { ...trip.value, paidAt: answer.paidAt }
  } catch {
    failed.value = 'That did not save. Check your connection and try again.'
  } finally {
    busyPersonId.value = null
  }
}

useHead({ title: () => (trip.value ? `${trip.value.title} · what you owe` : 'Trip Cost Splitter') })
</script>

<template>
  <div v-if="status === 'loading'" class="hint">Opening…</div>

  <div v-else-if="status === 'unreachable'" class="empty">
    <p>Could not reach this trip.</p>
    <p class="hint">The link is fine — the connection is the problem. Try again in a moment.</p>
    <button type="button" @click="open()">Try again</button>
  </div>

  <div v-else-if="status === 'missing' || !trip || !result" class="empty">
    <p>This link does not open anything.</p>
    <p class="hint">
      It may have been cut short — these links are long, and some chat apps trim them. Ask whoever sent it for
      the full link.
    </p>
  </div>

  <div v-else class="stack view">
    <!--
      The trip is the subtitle here, not the headline. The headline is the one
      sentence the person holding the phone came for.
    -->
    <p v-if="reader" class="eyebrow">{{ trip.title }}</p>
    <header v-else class="section__head page-head">
      <div>
        <p class="eyebrow">What everyone owes</p>
        <h1>{{ trip.title }}</h1>
        <p class="section__lede">
          {{ formatKm(result.totalDistanceKm) }}
          <template v-if="trip.pricing.mode !== 'per-km'">
            · {{ formatBasis(trip, result.totalEnergy, result.totalDistanceKm) }}
          </template>
          · {{ money(result.totalExact) }} in total
        </p>
      </div>
    </header>

    <!--
      Nobody named in the link, so ask once — and show the group view underneath
      meanwhile, rather than holding the page hostage to the question.
    -->
    <div v-if="!reader" class="view__who">
      <h2>Which one are you?</h2>
      <p class="hint">
        So this page can lead with your amount instead of a list to find yourself in. It is remembered on this
        device only.
      </p>
      <div class="button-row">
        <button
          v-for="person in result.people"
          :key="person.personId"
          type="button"
          class="button--quiet"
          @click="iAm(person.personId)"
        >
          {{ person.name }}
        </button>
      </div>
    </div>

    <template v-if="!reader">
      <section class="section">
        <SettleList
          :trip="trip"
          :people="result.people"
          :busy-person-id="busyPersonId"
          @toggle-paid="togglePaid"
        />

        <p v-if="failed" class="notice" style="margin-top: 12px">
          <span class="notice__mark">!</span><span>{{ failed }}</span>
        </p>
      </section>

      <details class="working">
        <summary class="working__summary">
          <span class="working__label">
            <strong>See how this was worked out</strong>
            <small>Every expense, every leg, and where each share came from</small>
          </span>
          <span class="working__chevron" aria-hidden="true">＋</span>
        </summary>
        <TripWorking :trip="trip" :result="result" />
      </details>

      <section v-if="result.warnings.length" class="section">
        <p class="eyebrow">Worth knowing</p>
        <WarningList :warnings="result.warnings" />
      </section>
    </template>

    <template v-else>
      <YouOwe
        :trip="trip"
        :person="reader"
        :busy="busyPersonId === reader.personId"
        @toggle-paid="togglePaid"
      />

      <p v-if="failed" class="notice">
        <span class="notice__mark">!</span><span>{{ failed }}</span>
      </p>

      <!-- Why that number, in their own legs rather than everybody's tables. -->
      <details class="working" open>
        <summary class="working__summary">
          <span class="working__label">
            <strong>Why {{ money(Math.abs(reader.owes)) }}?</strong>
            <small>The legs you were in the car for, and what they came to</small>
          </span>
          <span class="working__chevron" aria-hidden="true">＋</span>
        </summary>
        <YourLegs :trip="trip" :result="result" :person="reader" />
      </details>

      <details class="working">
        <summary class="working__summary">
          <span class="working__label">
            <strong>Everyone else</strong>
            <small>{{ others.length }} more on this trip</small>
          </span>
          <span class="working__chevron" aria-hidden="true">＋</span>
        </summary>
        <SplitList :trip="trip" :result="result" />
      </details>

      <details class="working">
        <summary class="working__summary">
          <span class="working__label">
            <strong>See how the whole trip was worked out</strong>
            <small>Every expense, every leg, and where each share came from</small>
          </span>
          <span class="working__chevron" aria-hidden="true">＋</span>
        </summary>
        <TripWorking :trip="trip" :result="result" />
      </details>

      <section v-if="result.warnings.length" class="section">
        <p class="eyebrow">Worth knowing</p>
        <WarningList :warnings="result.warnings" />
      </section>
    </template>
  </div>
</template>
