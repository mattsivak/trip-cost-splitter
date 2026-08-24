/**
 * Move one item to a new position, returning a new array.
 *
 * Out-of-range indices return an unchanged copy rather than throwing: the
 * callers are drag handlers and arrow buttons, where an impossible target is
 * a no-op, not an error.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (!isIndexOf(next, from) || !isIndexOf(next, to) || from === to) return next

  const [moved] = next.splice(from, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}

function isIndexOf(items: readonly unknown[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < items.length
}

/**
 * Insert an item directly after the given position, returning a new array.
 *
 * An index outside the list appends, which is what the callers want: "after
 * the drive I am looking at" degrades to "at the end" rather than throwing.
 */
export function insertAfter<T>(items: readonly T[], index: number, item: T): T[] {
  const next = [...items]
  if (!isIndexOf(next, index)) {
    next.push(item)
    return next
  }

  next.splice(index + 1, 0, item)
  return next
}
