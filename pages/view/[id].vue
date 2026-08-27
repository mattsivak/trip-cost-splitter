<script setup lang="ts">
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
const busyPersonId = ref<string | null>(null)
const failed = ref('')

const result = computed(() => (trip.value ? calculateTrip(trip.value) : null))

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
  viewKey.value = window.location.hash.replace(/^#/, '').trim()
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

  <div v-else class="stack">
    <header class="section__head page-head">
      <div>
        <p class="eyebrow">What you owe</p>
        <h1>{{ trip.title }}</h1>
        <p class="section__lede">
          {{ formatKm(result.totalDistanceKm) }}
          <template v-if="trip.pricing.mode !== 'per-km'">
            · {{ formatBasis(trip, result.totalEnergy, result.totalDistanceKm) }}
          </template>
          ·
          {{ Math.round(result.totalExact / 100).toLocaleString('cs-CZ') }} {{ trip.currency }} in total
        </p>
      </div>
    </header>

    <section class="section" style="margin-top: 0">
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

    <!--
      The calculator can know that the total in front of you is missing money —
      a receipt in a currency with no rate, fuel with nobody to charge it to.
      Telling only the person collecting, and not the people being asked to pay,
      is the wrong way round.
    -->
    <section v-if="result.warnings.length" class="section">
      <p class="eyebrow">Worth knowing</p>
      <WarningList :warnings="result.warnings" />
    </section>

    <!--
      Not the point of the page — the buttons above are — but the first thing
      anybody asks after "how much" is "for what", so it has to look like
      something you can open rather than a footnote under the total.
    -->
    <details class="working">
      <summary class="working__summary">
        <span class="working__label">
          <strong>See how this was worked out</strong>
          <small>Every receipt, every stretch, and where your share came from</small>
        </span>
        <span class="working__chevron" aria-hidden="true">＋</span>
      </summary>
      <TripWorking :trip="trip" :result="result" />
    </details>
  </div>
</template>
