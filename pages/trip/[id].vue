<script setup lang="ts">
const route = useRoute()
const tripId = computed(() => String(route.params.id ?? ''))

/**
 * A key in the fragment means somebody opened an edit link — their own way back
 * into a trip this browser does not know. Read once, before the load.
 */
const openKey = ref('')
if (import.meta.client) openKey.value = window.location.hash.replace(/^#/, '').trim()

const { trip, result, status, reload } = useTrip(tripId, openKey)

/** Which step, kept in the address so a reload lands where you were. */
const step = computed({
  get: () => Number(route.query.step ?? 0),
  set: (value: number) => {
    void navigateTo({ query: { ...route.query, step: value || undefined } }, { replace: true })
  },
})

useHead({ title: () => (trip.value ? `${trip.value.title} · Trip Cost Splitter` : 'Trip Cost Splitter') })
</script>

<template>
  <div v-if="status === 'loading'" class="hint">Opening the trip…</div>

  <div v-else-if="status === 'unreachable'" class="empty">
    <!--
      A question that went unanswered is not the answer "gone". Telling somebody
      their trip is not in this browser, when it is and the server merely could
      not be asked, sends them looking for a link they never needed.
    -->
    <p>Could not reach the trip.</p>
    <p class="hint">
      Your trip is safe and still on this device — the connection is the problem. This app gets used in
      tunnels; it happens.
    </p>
    <button type="button" @click="reload()">Try again</button>
  </div>

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

    <StepBar v-model="step" />

    <ThePeople v-if="step === 0" :trip="trip" />
    <TheLedger v-else-if="step === 1" :trip="trip" />
    <WhoPays v-else-if="step === 2" :trip="trip" />
    <template v-else>
      <TheSplit :trip="trip" :result="result" />
      <TheCollection :trip="trip" :result="result" />
    </template>

    <div class="button-row" style="margin-top: 24px; justify-content: space-between">
      <button
        type="button"
        class="button--quiet"
        :aria-disabled="step === 0"
        @click="step = Math.max(0, step - 1)"
      >
        Back
      </button>
      <button v-if="step < 3" type="button" @click="step += 1">Next</button>
    </div>
  </div>
</template>
