import { describe, expect, it, vi } from 'vitest'
import { useSegmentReorder, type ReorderDragEvent } from './useSegmentReorder'

function setup(initial = ['a', 'b', 'c', 'd']) {
  let items = [...initial]
  const reorder = useSegmentReorder(
    () => items,
    (next) => {
      items = next
    },
  )
  return { reorder, current: () => items }
}

function dragEvent(overrides: Partial<ReorderDragEvent> = {}): ReorderDragEvent & {
  preventDefault: ReturnType<typeof vi.fn>
} {
  return {
    preventDefault: vi.fn(),
    currentTarget: null,
    dataTransfer: {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    },
    ...overrides,
  } as ReorderDragEvent & { preventDefault: ReturnType<typeof vi.fn> }
}

describe('dragging to reorder', () => {
  it('moves the dragged item onto the drop target', () => {
    const { reorder, current } = setup()
    reorder.onDragStart(0, dragEvent())
    reorder.onDrop(2)
    expect(current()).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item backwards just as well', () => {
    const { reorder, current } = setup()
    reorder.onDragStart(3, dragEvent())
    reorder.onDrop(0)
    expect(current()).toEqual(['d', 'a', 'b', 'c'])
  })

  it('leaves the list alone when dropped on itself', () => {
    const { reorder, current } = setup()
    reorder.onDragStart(1, dragEvent())
    reorder.onDrop(1)
    expect(current()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ignores a drop that never started as a drag', () => {
    const { reorder, current } = setup()
    reorder.onDrop(2)
    expect(current()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('marks the item being dragged', () => {
    const { reorder } = setup()
    reorder.onDragStart(2, dragEvent())
    expect(reorder.draggingIndex.value).toBe(2)
  })

  it('clears its state after a drop', () => {
    const { reorder } = setup()
    reorder.onDragStart(0, dragEvent())
    reorder.onDragOver(2, dragEvent())
    reorder.onDrop(2)
    expect(reorder.draggingIndex.value).toBeNull()
    expect(reorder.overIndex.value).toBeNull()
  })

  it('clears its state when the drag is abandoned', () => {
    const { reorder, current } = setup()
    reorder.onDragStart(0, dragEvent())
    reorder.endDrag()
    expect(reorder.draggingIndex.value).toBeNull()
    expect(current()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('the drag payload', () => {
  it('advertises a move and carries the index', () => {
    const { reorder } = setup()
    const event = dragEvent()
    reorder.onDragStart(2, event)
    expect(event.dataTransfer?.effectAllowed).toBe('move')
    expect(event.dataTransfer?.setData).toHaveBeenCalledWith('text/plain', '2')
  })

  it('drags the whole card, not just the handle', () => {
    const card = document.createElement('article')
    card.className = 'segment'
    const handle = document.createElement('span')
    card.append(handle)

    const { reorder } = setup()
    const event = dragEvent({ currentTarget: handle })
    reorder.onDragStart(0, event)
    expect(event.dataTransfer?.setDragImage).toHaveBeenCalledWith(card, 24, 24)
  })

  it('survives a browser that gives us no dataTransfer', () => {
    const { reorder } = setup()
    expect(() => reorder.onDragStart(0, dragEvent({ dataTransfer: null }))).not.toThrow()
    expect(reorder.draggingIndex.value).toBe(0)
  })
})

describe('accepting the drop', () => {
  it('calls preventDefault, without which the browser refuses the drop', () => {
    const { reorder } = setup()
    reorder.onDragStart(0, dragEvent())
    const event = dragEvent()
    reorder.onDragOver(2, event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.dataTransfer?.dropEffect).toBe('move')
  })

  it('ignores dragover from a drag it did not start', () => {
    const { reorder } = setup()
    const event = dragEvent()
    reorder.onDragOver(2, event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(reorder.overIndex.value).toBeNull()
  })
})

describe('the drop indicator', () => {
  it('draws below the target when dragging downwards', () => {
    const { reorder } = setup()
    reorder.onDragStart(0, dragEvent())
    reorder.onDragOver(2, dragEvent())
    expect(reorder.dropEdge(2)).toBe('after')
  })

  it('draws above the target when dragging upwards', () => {
    const { reorder } = setup()
    reorder.onDragStart(3, dragEvent())
    reorder.onDragOver(1, dragEvent())
    expect(reorder.dropEdge(1)).toBe('before')
  })

  it('draws nothing on the card being dragged', () => {
    const { reorder } = setup()
    reorder.onDragStart(1, dragEvent())
    reorder.onDragOver(1, dragEvent())
    expect(reorder.dropEdge(1)).toBeNull()
  })

  it('draws nothing on cards that are not the target', () => {
    const { reorder } = setup()
    reorder.onDragStart(0, dragEvent())
    reorder.onDragOver(2, dragEvent())
    expect(reorder.dropEdge(1)).toBeNull()
    expect(reorder.dropEdge(3)).toBeNull()
  })

  it('draws nothing when no drag is in progress', () => {
    const { reorder } = setup()
    expect(reorder.dropEdge(0)).toBeNull()
  })
})

describe('the arrow buttons', () => {
  it('moves an item one place earlier', () => {
    const { reorder, current } = setup()
    reorder.move(2, -1)
    expect(current()).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves an item one place later', () => {
    const { reorder, current } = setup()
    reorder.move(0, 1)
    expect(current()).toEqual(['b', 'a', 'c', 'd'])
  })

  it('does nothing at the ends of the list', () => {
    const { reorder, current } = setup()
    reorder.move(0, -1)
    reorder.move(3, 1)
    expect(current()).toEqual(['a', 'b', 'c', 'd'])
  })
})
