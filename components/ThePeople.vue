<script setup lang="ts">
import { bought, ridden } from '~/src/domain/trip/energy'
import { createPerson } from '~/src/domain/trip/factories'
import type { Trip } from '~/src/domain/trip/types'

const props = defineProps<{ trip: Trip }>()

const newName = ref('')

function addPerson() {
  const name = newName.value.trim()
  if (!name) return

  const person = createPerson(name)
  props.trip.people.push(person)
  // The first person added is almost always whoever is doing the splitting.
  if (!props.trip.driverId) props.trip.driverId = person.id
  newName.value = ''
}

function removePerson(personId: string) {
  props.trip.people = props.trip.people.filter((person) => person.id !== personId)
  if (props.trip.driverId === personId) props.trip.driverId = props.trip.people[0]?.id ?? null

  for (const segment of ridden(props.trip.lines)) {
    segment.occupantIds = segment.occupantIds.filter((id) => id !== personId)
  }
  for (const cost of bought(props.trip.lines)) {
    if (cost.allocation.type === 'fixed') {
      cost.allocation.amounts = Object.fromEntries(
        Object.entries(cost.allocation.amounts).filter(([id]) => id !== personId),
      )
    } else if (cost.allocation.personIds) {
      cost.allocation.personIds = cost.allocation.personIds.filter((id) => id !== personId)
    }
  }
}

function segmentCount(personId: string): number {
  return ridden(props.trip.lines).filter((segment) => segment.occupantIds.includes(personId)).length
}
</script>

<template>
  <section class="section" style="margin-top: 0">
    <div class="section__head">
      <div>
        <p class="eyebrow">Who is splitting this</p>
        <h2>Who came along</h2>
        <p class="section__lede">
          Everyone who was in the car at any point, including whoever paid. The driver is marked because they
          carry the rounding and anything nobody else can be billed for.
        </p>
      </div>
    </div>

    <div class="button-row" style="margin-bottom: 20px">
      <input v-model="newName" placeholder="Name" style="max-width: 260px" @keyup.enter="addPerson" />
      <button type="button" :disabled="!newName.trim()" @click="addPerson">Add person</button>
    </div>

    <div v-if="!trip.people.length" class="empty">
      <p>Nobody on this trip yet.</p>
    </div>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th>Driver</th>
            <th class="is-figure">On</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in trip.people"
            :key="person.id"
            :class="{ 'is-driver': trip.driverId === person.id }"
          >
            <td>
              <input v-model="person.name" :aria-label="`Name for ${person.name}`" />
            </td>
            <td>
              <label class="toggle" :class="{ 'is-on': trip.driverId === person.id }">
                <input
                  type="radio"
                  :checked="trip.driverId === person.id"
                  :name="`driver-${trip.id}`"
                  @change="trip.driverId = person.id"
                />
                <span>{{ trip.driverId === person.id ? 'Driving' : 'Set as driver' }}</span>
              </label>
            </td>
            <td class="is-figure">{{ segmentCount(person.id) }}</td>
            <td class="is-figure">
              <button type="button" class="button--danger" @click="removePerson(person.id)">Remove</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
