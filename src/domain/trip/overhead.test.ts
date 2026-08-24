import { describe, expect, it } from 'vitest'
import { sumMoney } from '../money/money'
import { allocateOverhead } from './overhead'
import type { OverheadCost, Person } from './types'

const people: Person[] = [
  { id: 'a', name: 'Ann' },
  { id: 'b', name: 'Bo' },
  { id: 'c', name: 'Cy' },
]

function cost(overrides: Partial<OverheadCost> = {}): OverheadCost {
  return { id: 'o1', label: 'Tolls', amount: 10000, allocation: { type: 'even' }, ...overrides }
}

describe('even allocation', () => {
  it('splits across everyone when no people are named', () => {
    const result = allocateOverhead(cost({ amount: 9000 }), people)
    expect(result.shares).toEqual({ a: 3000, b: 3000, c: 3000 })
    expect(result.warnings).toEqual([])
  })

  it('splits across only the named people', () => {
    const result = allocateOverhead(cost({ allocation: { type: 'even', personIds: ['a', 'c'] } }), people)
    expect(result.shares).toEqual({ a: 5000, c: 5000 })
  })

  it('loses nothing to rounding on an indivisible amount', () => {
    const result = allocateOverhead(cost({ amount: 10000 }), people)
    expect(sumMoney(Object.values(result.shares))).toBe(10000)
    expect(result.total).toBe(10000)
  })

  it('ignores named people who are not on the trip', () => {
    const result = allocateOverhead(cost({ allocation: { type: 'even', personIds: ['a', 'ghost'] } }), people)
    expect(result.shares).toEqual({ a: 10000 })
  })

  it('warns and charges nobody when there is no one left to bill', () => {
    const result = allocateOverhead(cost({ allocation: { type: 'even', personIds: ['ghost'] } }), people)
    expect(result.shares).toEqual({})
    expect(result.total).toBe(0)
    expect(result.warnings).toHaveLength(1)
  })
})

describe('fixed allocation', () => {
  it('uses the stated per-person amounts', () => {
    const result = allocateOverhead(
      cost({ amount: 10000, allocation: { type: 'fixed', amounts: { a: 6000, b: 4000 } } }),
      people,
    )
    expect(result.shares).toEqual({ a: 6000, b: 4000 })
    expect(result.total).toBe(10000)
    expect(result.warnings).toEqual([])
  })

  it('reports the amount it actually handed out, not the nominal one', () => {
    const result = allocateOverhead(
      cost({ amount: 10000, allocation: { type: 'fixed', amounts: { a: 1000 } } }),
      people,
    )
    expect(result.total).toBe(1000)
    expect(result.warnings).toHaveLength(1)
  })

  it('drops amounts aimed at people who are not on the trip', () => {
    const result = allocateOverhead(
      cost({ amount: 5000, allocation: { type: 'fixed', amounts: { a: 5000, ghost: 900 } } }),
      people,
    )
    expect(result.shares).toEqual({ a: 5000 })
    expect(result.warnings).toHaveLength(1)
  })
})
