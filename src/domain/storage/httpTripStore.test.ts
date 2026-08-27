import { describe, expect, it, vi } from 'vitest'
import { makeTrip } from '../trip/testing'
import type { Trip } from '../trip/types'
import { createHttpTripStore, TRIP_INDEX_KEY, type TripApi } from './httpTripStore'
import { createMemoryStorage } from './localTripStore'

function fakeApi(overrides: Partial<TripApi> = {}) {
  const trips = new Map<string, Trip>()
  const api: TripApi = {
    create: vi.fn(async (trip: Trip) => {
      trips.set(trip.id, trip)
      return { id: trip.id, viewKey: 'v'.repeat(32), editKey: 'e'.repeat(32), trip }
    }),
    read: vi.fn(async (id: string, key: string) => {
      const trip = trips.get(id)
      if (!trip) return null
      const access = key === 'v'.repeat(32) ? ('view' as const) : ('edit' as const)
      return access === 'edit' ? { trip, access, viewKey: 'v'.repeat(32) } : { trip, access }
    }),
    update: vi.fn(async (id: string, _key: string, trip: Trip) => {
      trips.set(id, trip)
      return trip
    }),
    destroy: vi.fn(async (id: string) => void trips.delete(id)),
    ...overrides,
  }
  return { api, trips }
}

describe('saving', () => {
  it('creates a trip the first time and remembers its keys', async () => {
    const { api } = fakeApi()
    const storage = createMemoryStorage()
    const store = createHttpTripStore(api, storage)

    await store.save(makeTrip({ id: 't1', title: 'Alps' }))

    expect(api.create).toHaveBeenCalledTimes(1)
    expect(store.keysFor('t1')).toEqual({ id: 't1', viewKey: 'v'.repeat(32), editKey: 'e'.repeat(32) })
  })

  it('updates with the edit key on every save after that', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())

    await store.save(makeTrip({ id: 't1' }))
    await store.save(makeTrip({ id: 't1', title: 'Renamed' }))

    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenCalledWith(
      't1',
      'e'.repeat(32),
      expect.objectContaining({ title: 'Renamed' }),
    )
  })

  it('keeps the list in step without asking the server', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())

    await store.save(makeTrip({ id: 't1', title: 'Alps' }))
    const list = await store.list()

    expect(list).toEqual([
      { id: 't1', title: 'Alps', updatedAt: expect.any(String), peopleCount: 3, segmentCount: 0 },
    ])
    expect(api.read).not.toHaveBeenCalled()
  })
})

describe('loading', () => {
  it('reads with the edit key', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    await store.save(makeTrip({ id: 't1' }))

    expect((await store.load('t1'))?.id).toBe('t1')
    expect(api.read).toHaveBeenCalledWith('t1', 'e'.repeat(32))
  })

  it('returns null for a trip this browser never made', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    expect(await store.load('unknown')).toBeNull()
    expect(api.read).not.toHaveBeenCalled()
  })

  it('forgets a trip the server no longer has', async () => {
    const { api, trips } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    await store.save(makeTrip({ id: 't1' }))
    trips.delete('t1')

    expect(await store.load('t1')).toBeNull()
    // Leaving it listed would offer a trip that cannot be opened.
    expect(await store.list()).toEqual([])
  })
})

describe('removing', () => {
  it('deletes on the server and drops it locally', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    await store.save(makeTrip({ id: 't1' }))

    await store.remove('t1')
    expect(api.destroy).toHaveBeenCalledWith('t1', 'e'.repeat(32))
    expect(await store.list()).toEqual([])
  })

  it('does nothing for a trip it does not know', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    await store.remove('nope')
    expect(api.destroy).not.toHaveBeenCalled()
  })
})

describe('the local index', () => {
  it('survives being corrupted', async () => {
    const { api } = fakeApi()
    const storage = createMemoryStorage({ [TRIP_INDEX_KEY]: '{not json' })
    const store = createHttpTripStore(api, storage)

    expect(await store.list()).toEqual([])
    await store.save(makeTrip({ id: 't1' }))
    expect(await store.list()).toHaveLength(1)
  })

  it('ignores entries missing their keys', async () => {
    const { api } = fakeApi()
    const storage = createMemoryStorage({
      [TRIP_INDEX_KEY]: JSON.stringify([{ id: 't1', title: 'No keys' }, 'nonsense']),
    })
    expect(await createHttpTripStore(api, storage).list()).toEqual([])
  })

  it('lists the most recently updated first', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    await store.save(makeTrip({ id: 'old', updatedAt: '2020-01-01T00:00:00.000Z' }))
    await store.save(makeTrip({ id: 'new', updatedAt: '2026-01-01T00:00:00.000Z' }))

    expect((await store.list()).map((entry) => entry.id)).toEqual(['new', 'old'])
  })
})

describe('opening a trip from an edit link', () => {
  it('takes a trip this browser has never seen and remembers it', async () => {
    const { api, trips } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    trips.set('t1', makeTrip({ id: 't1', title: 'Alps' }))

    const adopted = await store.adopt('t1', 'e'.repeat(32))

    expect(adopted?.title).toBe('Alps')
    expect(store.keysFor('t1')?.editKey).toBe('e'.repeat(32))
    // And it is now one of your trips, listed like any other.
    expect(await store.list()).toHaveLength(1)
  })

  /** So the payment link still works on the device that opened the edit link. */
  it('takes the view key the server hands back with the trip', async () => {
    const { api, trips } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    trips.set('t1', makeTrip({ id: 't1' }))

    await store.adopt('t1', 'e'.repeat(32))

    expect(store.keysFor('t1')?.viewKey).toBe('v'.repeat(32))
  })

  /**
   * A view key opens the trip — that is what the group's link is — but it
   * cannot change it. Adopting on the strength of one would put the wizard in
   * front of somebody whose every save is refused.
   */
  it('refuses a view key, which reads but cannot write', async () => {
    const { api, trips } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    trips.set('t1', makeTrip({ id: 't1' }))

    expect(await store.adopt('t1', 'v'.repeat(32))).toBeNull()
    expect(store.keysFor('t1')).toBeNull()
  })

  it('reads with the key from the link, not one it already held', async () => {
    const { api, trips } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    trips.set('t1', makeTrip({ id: 't1' }))

    await store.adopt('t1', 'f'.repeat(32))

    expect(api.read).toHaveBeenCalledWith('t1', 'f'.repeat(32))
  })

  it('remembers nothing when the key does not open the trip', async () => {
    const { api } = fakeApi({ read: vi.fn(async () => null) })
    const store = createHttpTripStore(api, createMemoryStorage())

    expect(await store.adopt('t1', 'e'.repeat(32))).toBeNull()
    expect(store.keysFor('t1')).toBeNull()
    expect(await store.list()).toEqual([])
  })

  /**
   * The view key is the only key the reader of a payment link has, and it must
   * not become an edit key by being pasted into the wizard's address.
   */
  it('leaves an existing entry alone when the key is refused', async () => {
    const { api } = fakeApi()
    const store = createHttpTripStore(api, createMemoryStorage())
    await store.save(makeTrip({ id: 't1', title: 'Alps' }))
    api.read = vi.fn(async () => null)

    expect(await store.adopt('t1', 'wrong-key')).toBeNull()
    expect(store.keysFor('t1')?.editKey).toBe('e'.repeat(32))
  })
})
