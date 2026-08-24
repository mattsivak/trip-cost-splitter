<script setup lang="ts">
const route = useRoute()
const tripId = computed(() => String(route.params.id ?? ''))

const { trip, result, status } = useTrip(tripId)
const step = ref(0)

useHead({ title: () => (trip.value ? `${trip.value.title} · Trip Cost Splitter` : 'Trip Cost Splitter') })
</script>

<template>
  <div v-if="status === 'loading'" class="hint">Opening the trip…</div>

  <div v-else-if="status === 'missing' || !trip || !result" class="empty">
    <p>That trip is not in this browser.</p>
    <p class="hint">
      Trips are stored on the device that made them. If someone sent you a share link, open that link instead.
    </p>
    <NuxtLink to="/"><button type="button" class="button--quiet">Back to your trips</button></NuxtLink>
  </div>

  <div v-else>
    <div class="field-row" style="margin-bottom: 20px">
      <label class="field field--wide">
        <span>Trip</span>
        <input v-model="trip.title" />
      </label>
      <label class="field">
        <span>Currency</span>
        <input v-model="trip.currency" />
      </label>
      <label class="field">
        <span>Rounding</span>
        <select v-model="trip.rounding">
          <option value="nearest">To the nearest</option>
          <option value="up">Always up</option>
          <option value="down">Always down</option>
        </select>
      </label>
    </div>

    <PumpReadout :trip="trip" :result="result" />

    <StepRail v-model="step" />

    <RouteStep v-if="step === 0" :trip="trip" />
    <PeopleStep v-else-if="step === 1" :trip="trip" />
    <AssignStep v-else-if="step === 2" :trip="trip" />
    <ResultStep v-else-if="step === 3" :trip="trip" :result="result" />
    <CollectStep v-else :trip="trip" :result="result" />

    <div class="button-row" style="margin-top: 32px; justify-content: space-between">
      <button type="button" class="button--quiet" :disabled="step === 0" @click="step -= 1">Back</button>
      <button v-if="step < 4" type="button" @click="step += 1">Next</button>
    </div>
  </div>
</template>
