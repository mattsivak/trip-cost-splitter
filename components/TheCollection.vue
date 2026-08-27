<script setup lang="ts">
import { canBuildPaymentLinks, paymentCurrencyCode } from '~/src/domain/settle/payment'
import { normalizeRevolutHandle, revolutProfileUrl } from '~/src/domain/settle/revolut'
import { buildCopyUrl, buildEditUrl, buildViewUrl } from '~/src/domain/storage/urlCodec'
import type { TripResult } from '~/src/domain/trip/result'
import type { Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip; result: TripResult }>()

const store = useTripStore()
const copied = ref<'' | 'view' | 'copy' | 'edit'>('')
const busyPersonId = ref<string | null>(null)

const keys = computed(() => store.keysFor(props.trip.id))

const handle = computed({
  get: () => props.trip.revolutHandle ?? '',
  set: (value: string) => {
    props.trip.revolutHandle = value
  },
})

/**
 * The field holds the handle alone; `revolut.me/` is printed beside it.
 *
 * People paste the whole link anyway, so anything with a slash, an @ or a
 * scheme in it is reduced to the handle as it lands. Plain typing is left
 * alone — collapsing on every keystroke would fight anyone typing a dot.
 */
function tidyIfPasted() {
  if (!/[/@:]/.test(handle.value)) return
  const tidied = normalizeRevolutHandle(handle.value)
  if (tidied) handle.value = tidied
}

function tidyOnBlur() {
  const tidied = normalizeRevolutHandle(handle.value)
  if (tidied) handle.value = tidied
}

const handleOk = computed(() => normalizeRevolutHandle(handle.value) !== null)
const profileUrl = computed(() => revolutProfileUrl(handle.value))

/**
 * Revolut needs an ISO code; the trip's currency is free text for display.
 * When it cannot be worked out the interface asks rather than guessing, since
 * a wrong code would build a link asking for the wrong money.
 */
const currencyCode = computed({
  get: () => paymentCurrencyCode(props.trip) ?? '',
  set: (value: string) => {
    props.trip.currencyCode = value.trim().toUpperCase()
  },
})

const canPay = computed(() => canBuildPaymentLinks(props.trip))

/**
 * A code only guessed from the symbol is written down as soon as this step is
 * opened. Otherwise the field shows CZK while the trip stores nothing, and the
 * payment links quietly fail to appear.
 */
onMounted(() => {
  if (!props.trip.currencyCode && currencyCode.value) props.trip.currencyCode = currencyCode.value
})

async function copy(which: 'view' | 'copy' | 'edit') {
  const origin = window.location.origin
  const link =
    which === 'view'
      ? keys.value && buildViewUrl(origin, props.trip.id, keys.value.viewKey)
      : which === 'edit'
        ? keys.value && buildEditUrl(origin, props.trip.id, keys.value.editKey)
        : buildCopyUrl(origin, props.trip)
  if (!link) return

  try {
    await navigator.clipboard.writeText(link)
    copied.value = which
    setTimeout(() => (copied.value = ''), 1800)
  } catch {
    copied.value = ''
  }
}

/**
 * Marking paid goes through the endpoint even here, so there is exactly one
 * writer for that field. Editing the trip locally and letting autosave carry
 * it would race with anyone marking themselves paid from the shared link.
 */
async function togglePaid(personId: string, paid: boolean) {
  const keys = store.keysFor(props.trip.id)
  if (!keys) return

  busyPersonId.value = personId
  try {
    const answer = await $fetch<{ paidAt: Record<string, string> }>(
      `/api/trips/${encodeURIComponent(props.trip.id)}/paid` as string,
      { method: 'POST', body: { key: keys.editKey, personId, paid } },
    )
    props.trip.paidAt = answer.paidAt
  } catch {
    // Leave the row as it was; the next click can try again.
  } finally {
    busyPersonId.value = null
  }
}
</script>

<template>
  <div class="stack">
    <section class="section" style="margin-top: 0">
      <div class="section__head">
        <div>
          <p class="eyebrow">Getting it back</p>
          <h2>Getting it back</h2>
          <p class="section__lede">
            Send everyone a link showing what they owe, with a payment button. They can mark themselves paid
            from it — you do not have to chase and tick people off yourself.
          </p>
        </div>
      </div>

      <div class="field-row" style="max-width: 620px">
        <label class="field">
          <span>Your Revolut handle</span>
          <div class="input-prefix">
            <span class="input-prefix__fixed">revolut.me/</span>
            <input
              v-model="handle"
              aria-label="Your Revolut handle"
              placeholder="yourname"
              spellcheck="false"
              autocapitalize="off"
              autocorrect="off"
              @input="tidyIfPasted"
              @blur="tidyOnBlur"
            />
          </div>
        </label>
        <label class="field" style="max-width: 140px">
          <span>Currency code</span>
          <input v-model="currencyCode" placeholder="CZK" maxlength="3" spellcheck="false" />
        </label>
      </div>

      <p v-if="handle && !handleOk" class="notice" style="margin-top: 12px">
        <span class="notice__mark">!</span>
        <span>That does not look like a Revolut handle. Paste your revolut.me link.</span>
      </p>
      <p v-else-if="profileUrl" class="hint" style="margin-top: 12px">
        <a :href="profileUrl" target="_blank" rel="noopener noreferrer">Open {{ profileUrl }}</a> to check it
        is really yours before sending this to anyone.
      </p>
      <p v-else class="hint" style="margin-top: 12px">
        Without a handle the link still shows what everyone owes, just with no payment button.
      </p>
    </section>

    <section class="section">
      <div class="section__head">
        <div>
          <p class="eyebrow">The link to send</p>
          <h2>Share it</h2>
        </div>
        <div class="button-row">
          <button type="button" class="button--quiet" :disabled="!keys" @click="copy('edit')">
            {{ copied === 'edit' ? 'Copied' : 'Copy the link back to this trip' }}
          </button>
          <button type="button" class="button--quiet" :disabled="!keys" @click="copy('copy')">
            {{ copied === 'copy' ? 'Copied' : 'Copy an editable copy' }}
          </button>
          <button type="button" :disabled="!keys" @click="copy('view')">
            {{ copied === 'view' ? 'Copied' : 'Copy the payment link' }}
          </button>
        </div>
      </div>

      <p class="hint">
        The payment link is read-only: whoever opens it sees the amounts and the working, and can mark
        themselves paid, but cannot change the trip. The editable copy is for handing the whole trip to
        somebody else — it makes them their own separate copy.
      </p>

      <p class="hint">
        <strong>The link back to this trip is for you, not for the group.</strong> A trip is yours because
        this browser holds its key, so clearing your site data — or picking up a different device — loses your
        way in. Keep that link somewhere and you can open the trip anywhere. Anyone who has it can change the
        trip and delete it, so it is not one to paste into the group chat.
      </p>
    </section>

    <section class="section">
      <div class="section__head">
        <div>
          <p class="eyebrow">Who still owes</p>
          <h2>Settling up</h2>
        </div>
      </div>

      <p v-if="!canPay" class="hint" style="margin-bottom: 8px">
        Add your handle and a three-letter currency code to give everyone a payment button.
      </p>

      <SettleList
        :trip="trip"
        :people="result.people"
        :busy-person-id="busyPersonId"
        @toggle-paid="togglePaid"
      />
    </section>
  </div>
</template>
