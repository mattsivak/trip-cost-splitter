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
    read: vi.fn(async (id: string) => {
      const trip = trips.get(id)
      return trip ? { trip } : null
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
