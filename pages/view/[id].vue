<script setup lang="ts">
import { calculateTrip } from '~/src/domain/trip/calculateTrip'
import { formatEnergyMix } from '~/src/domain/trip/energy'
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
const status = ref<'loading' | 'ready' | 'missing'>('loading')
const viewKey = ref('')
const busyPersonId = ref<string | null>(null)
const failed = ref('')

const result = computed(() => (trip.value ? calculateTrip(trip.value) : null))

const path = computed(() => `/api/trips/${encodeURIComponent(tripId.value)}`)

onMounted(async () => {
  viewKey.value = window.location.hash.replace(/^#/, '').trim()
  if (!viewKey.value) {
    status.value = 'missing'
    return
  }

  try {
    const answer = await $fetch<{ trip: Trip }>(path.value as string, { query: { key: viewKey.value } })
    trip.value = answer.trip
    status.value = 'ready'
  } catch {
    status.value = 'missing'
  }
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

  <div v-else-if="status === 'missing' || !trip || !result" class="empty">
    <p>This link does not open anything.</p>
    <p class="hint">
      It may have been cut short — these links are long, and some chat apps trim them. Ask whoever sent it for
      the full link.
    </p>
  </div>

  <div v-else class="stack">
    <section class="section" style="margin-top: 0">
      <div class="section__head">
        <div>
          <p class="eyebrow">What you owe</p>
          <h1>{{ trip.title }}</h1>
          <p class="section__lede">
            {{ formatKm(result.totalDistanceKm) }} · {{ formatEnergyMix(result.totalEnergy, trip.streams) }} ·
            {{ Math.round(result.totalExact / 100).toLocaleString('cs-CZ') }} {{ trip.currency }} in total
          </p>
        </div>
      </div>

      <p class="view-note">
        This is a read-only view of someone else's trip. You can pay and mark yourself paid; nothing else here
        can be changed.
      </p>
    </section>

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
      <summary>How this was worked out</summary>
      <TripWorking :trip="trip" :result="result" />
    </details>
  </div>
</template>
