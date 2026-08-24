import { ref } from 'vue'
import { moveItem } from '~/src/domain/list'

/** The slice of DragEvent this needs. Keeps the logic testable without a browser. */
export interface ReorderDragEvent {
  preventDefault: () => void
  currentTarget: EventTarget | null
  dataTransfer: {
    effectAllowed: string
    dropEffect: string
    setData: (format: string, data: string) => void
    setDragImage?: (image: Element, x: number, y: number) => void
  } | null
}

/**
 * Drag-to-reorder for a list of segments.
 *
 * The handle carries `draggable`, not the card: the cards are full of text
 * inputs, and a draggable ancestor stops you selecting or clicking into them.
 * The card is still what you see moving — `setDragImage` borrows it.
 *
 * This deliberately does not replace the arrow buttons. HTML5 drag events
 * never fire on touch and cannot be driven from the keyboard, so the buttons
 * are the only way to reorder for anyone not using a mouse.
 */
export function useSegmentReorder<T>(read: () => T[], write: (items: T[]) => void) {
  const draggingIndex = ref<number | null>(null)
  const overIndex = ref<number | null>(null)

  function onDragStart(index: number, event: ReorderDragEvent) {
    draggingIndex.value = index
    if (!event.dataTransfer) return

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))

    const handle = event.currentTarget
    const card = handle instanceof Element ? handle.closest('.segment') : null
    if (card) event.dataTransfer.setDragImage?.(card, 24, 24)
  }

  function onDragOver(index: number, event: ReorderDragEvent) {
    if (draggingIndex.value === null) return
    // Without preventDefault the browser refuses the drop outright.
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    overIndex.value = index
  }

  function onDrop(index: number) {
    if (draggingIndex.value !== null) write(moveItem(read(), draggingIndex.value, index))
    endDrag()
  }

  function endDrag() {
    draggingIndex.value = null
    overIndex.value = null
  }

  /** Which edge of a card to draw the drop line on, if any. */
  function dropEdge(index: number): 'before' | 'after' | null {
    if (draggingIndex.value === null) return null
    if (overIndex.value !== index || draggingIndex.value === index) return null
    return draggingIndex.value < index ? 'after' : 'before'
  }

  function move(index: number, delta: number) {
    write(moveItem(read(), index, index + delta))
  }

  return { draggingIndex, overIndex, onDragStart, onDragOver, onDrop, endDrag, dropEdge, move }
}
