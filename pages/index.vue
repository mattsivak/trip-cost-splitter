<script setup lang="ts">
import { createDemoTrip } from '~/src/fixtures/demoTrip'
import { currencySymbol } from '~/src/domain/money/currency'
import { createTrip } from '~/src/domain/trip/factories'
import type { TripSummary } from '~/src/domain/storage/tripStore'

const store = useTripStore()
const router = useRouter()
const trips = ref<TripSummary[]>([])
const loading = ref(true)

onMounted(refresh)

async function refresh() {
  trips.value = await store.list()
  loading.value = false
}

const starting = ref(false)

async function startTrip() {
  starting.value = true
  const trip = createTrip({ title: 'New trip' })

  // Price and currency are applied together or not at all: a euro figure under
  // a Kč label would be worse than no figure.
  const { price } = await fetchLocalPrice(trip.energyKind)
  if (price) {
    trip.pricing = {
      mode: 'fixed-price',
      pricePerUnit: priceToMoney(price),
      source: {
        countryName: price.countryName,
        fetchedAt: price.fetchedAt,
        convertedFromGallons: price.convertedFromGallons,
      },
    }
    trip.currency = currencySymbol(price.currency)
  }

  const saved = await store.save(trip)
  starting.value = false
  await router.push(`/trip/${saved.id}`)
}

async function loadDemo() {
  const demo = createDemoTrip()
  await store.save(demo)
  await router.push(`/trip/${demo.id}`)
}

async function removeTrip(id: string, title: string) {
  if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return
  await store.remove(id)
  await refresh()
}

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('cs-CZ', { dateStyle: 'medium' })
}
</script>

<template>
  <div>
    <section class="section" style="margin-top: 0">
      <div class="section__head">
        <div>
          <p class="eyebrow">Your trips</p>
          <h1>Work out who owes what for the fuel.</h1>
          <p class="section__lede">
            Lay out the route, say who was in the car for each stretch, and the app splits the fuel by the
            litres each person was actually there for. Everything stays in this browser.
          </p>
        </div>
        <div v-if="trips.length" class="button-row">
          <button type="button" :disabled="starting" @click="startTrip">
            {{ starting ? 'Starting…' : 'Start a trip' }}
          </button>
        </div>
      </div>

      <p v-if="loading" class="hint">Reading your trips…</p>

      <div v-else-if="!trips.length" class="empty">
        <p>Nothing here yet.</p>
        <div class="button-row">
          <button type="button" :disabled="starting" @click="startTrip">
            {{ starting ? 'Starting…' : 'Start a trip' }}
          </button>
          <button type="button" class="button--quiet" @click="loadDemo">Open the example trip</button>
        </div>
      </div>

      <div v-else class="trips">
        <div v-for="trip in trips" :key="trip.id" class="trip-row">
          <NuxtLink :to="`/trip/${trip.id}`" class="trip-row__link">
            <strong>{{ trip.title }}</strong>
            <span class="trip-row__meta">
              {{ trip.peopleCount }} people · {{ trip.segmentCount }} parts · edited
              {{ when(trip.updatedAt) }}
            </span>
          </NuxtLink>
          <button type="button" class="button--danger" @click="removeTrip(trip.id, trip.title)">
            Delete
          </button>
        </div>
      </div>
    </section>

    <section v-if="trips.length" class="section">
      <p class="hint">
        Curious how it handles a messy real trip?
        <button type="button" class="button--quiet" @click="loadDemo">Open the example trip</button>
      </p>
    </section>
  </div>
</template>
