<script setup lang="ts">
import type { Person, PersonId } from '~/src/domain/trip/types'

const props = defineProps<{
  people: Person[]
  occupantIds: PersonId[]
  driverId: PersonId | null
  /** Optional per-person figure, shown inside the pill when assigned. */
  shares?: Record<PersonId, string>
}>()

const emit = defineEmits<{ toggle: [personId: PersonId] }>()

function isOn(personId: PersonId): boolean {
  return props.occupantIds.includes(personId)
}
</script>

<template>
  <div class="toggles">
    <label v-for="person in people" :key="person.id" class="toggle" :class="{ 'is-on': isOn(person.id) }">
      <input type="checkbox" :checked="isOn(person.id)" @change="emit('toggle', person.id)" />
      <span>{{ person.name }}{{ person.id === driverId ? ' ·' : '' }}</span>
      <span v-if="isOn(person.id) && shares?.[person.id]" class="toggle__share">{{ shares[person.id] }}</span>
    </label>
    <p v-if="!people.length" class="hint">Add people in step 2 first.</p>
  </div>
</template>
