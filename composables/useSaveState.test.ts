import { beforeEach, describe, expect, it } from 'vitest'
import { useSaveState } from './useSaveState'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // A rejection is always handled by the code under test; this keeps the
  // unhandled-rejection warning away while the test sets things up.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

describe('useSaveState', () => {
  beforeEach(() => {
    useSaveState().reset()
  })

  it('shows nothing until something is saved', () => {
    expect(useSaveState().state.value).toBe('off')
  })

  it('shows saving while the save is in flight', async () => {
    const { state, attempt } = useSaveState()
    const save = deferred()

    void attempt(() => save.promise)
    expect(state.value).toBe('saving')

    save.resolve()
  })

  it('shows saved once the save settles', async () => {
    const { state, attempt } = useSaveState()

    await attempt(async () => {})

    expect(state.value).toBe('saved')
  })

  it('shows failed when the save throws', async () => {
    const { state, attempt } = useSaveState()

    await attempt(async () => {
      throw new Error('offline')
    })

    expect(state.value).toBe('failed')
  })

  it('retries the save that failed', async () => {
    const { state, attempt, retry } = useSaveState()
    let attempts = 0

    await attempt(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('offline')
    })
    await retry()

    expect(attempts).toBe(2)
    expect(state.value).toBe('saved')
  })

  it('stays failed when the retry fails too', async () => {
    const { state, attempt, retry } = useSaveState()

    await attempt(async () => {
      throw new Error('offline')
    })
    await retry()

    expect(state.value).toBe('failed')
  })

  it('does nothing when there is no failed save to retry', async () => {
    const { state, retry } = useSaveState()

    await retry()

    expect(state.value).toBe('off')
  })

  it('lets a newer save override an older one that settles late', async () => {
    const { state, attempt } = useSaveState()
    const slow = deferred()

    const first = attempt(() => slow.promise)
    await attempt(async () => {})
    expect(state.value).toBe('saved')

    slow.reject(new Error('offline'))
    await first

    expect(state.value).toBe('saved')
  })

  it('forgets the state when the page that saves goes away', async () => {
    const { state, attempt, reset } = useSaveState()

    await attempt(async () => {})
    reset()

    expect(state.value).toBe('off')
  })

  it('says nothing about a save on the way out that lands', async () => {
    const { state, finish } = useSaveState()

    await finish(async () => {})

    expect(state.value).toBe('off')
  })

  it('still reports a save on the way out that does not land', async () => {
    const { state, finish, retry } = useSaveState()
    let attempts = 0

    await finish(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('offline')
    })
    expect(state.value).toBe('failed')

    await retry()
    expect(state.value).toBe('saved')
  })
})
