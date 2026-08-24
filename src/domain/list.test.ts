import { describe, expect, it } from 'vitest'
import { insertAfter, moveItem } from './list'

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd']

  it('moves an item later in the list', () => {
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item earlier in the list', () => {
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves an item to the very end', () => {
    expect(moveItem(items, 0, 3)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('moves an item to the very start', () => {
    expect(moveItem(items, 2, 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('treats a move onto itself as a no-op', () => {
    expect(moveItem(items, 1, 1)).toEqual(items)
  })

  it('ignores indices outside the list', () => {
    expect(moveItem(items, -1, 2)).toEqual(items)
    expect(moveItem(items, 0, 9)).toEqual(items)
    expect(moveItem(items, 9, 0)).toEqual(items)
    expect(moveItem(items, 0.5, 2)).toEqual(items)
  })

  it('never mutates the array it was given', () => {
    const original = [...items]
    moveItem(items, 0, 3)
    expect(items).toEqual(original)
  })

  it('copes with an empty list', () => {
    expect(moveItem([], 0, 0)).toEqual([])
  })

  it('keeps every item exactly once', () => {
    for (let from = 0; from < items.length; from += 1) {
      for (let to = 0; to < items.length; to += 1) {
        expect([...moveItem(items, from, to)].sort()).toEqual([...items].sort())
      }
    }
  })
})

describe('insertAfter', () => {
  const items = ['a', 'b', 'c']

  it('puts the item straight after the one it belongs to', () => {
    expect(insertAfter(items, 0, 'x')).toEqual(['a', 'x', 'b', 'c'])
    expect(insertAfter(items, 1, 'x')).toEqual(['a', 'b', 'x', 'c'])
  })

  it('appends when the anchor is the last item', () => {
    expect(insertAfter(items, 2, 'x')).toEqual(['a', 'b', 'c', 'x'])
  })

  it('appends when there is no anchor at all', () => {
    expect(insertAfter(items, 9, 'x')).toEqual(['a', 'b', 'c', 'x'])
    expect(insertAfter(items, -1, 'x')).toEqual(['a', 'b', 'c', 'x'])
    expect(insertAfter([], 0, 'x')).toEqual(['x'])
  })

  it('never mutates the array it was given', () => {
    const original = [...items]
    insertAfter(items, 1, 'x')
    expect(items).toEqual(original)
  })
})
