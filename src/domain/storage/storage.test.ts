import { describe, expect, it } from 'vitest'
import { fromMajor } from '../money/money'
import { createTrip } from '../trip/factories'
import { makeDrive, makeIdle, makeTrip } from '../trip/testing'
import { createLocalTripStore, createMemoryStorage, TRIP_KEY_PREFIX } from './localTripStore'
import { parseTrip } from './serialization'
import { buildCopyUrl, buildViewUrl, decodeTripFromToken, encodeTripToToken } from './urlCodec'

describe('parseTrip', () => {
  it('rejects anything that is not an object', () => {
    expect(parseTrip(null)).toBeNull()
    expect(parseTrip('a trip')).toBeNull()
    expect(parseTrip([])).toBeNull()
  })

  it('round-trips a full trip unchanged', () => {
    const trip = makeTrip({ segments: [makeDrive(), makeIdle({ occupantIds: ['ann', 'bo'] })] })
    expect(parseTrip(JSON.parse(JSON.stringify(trip)))).toEqual(trip)
  })

  it('fills in defaults for a nearly empty object', () => {
    const trip = parseTrip({ title: 'Bare' })
    expect(trip?.title).toBe('Bare')
    expect(trip?.currency).toBe('Kč')
    expect(trip?.pricingMode).toBe('fixed-price')
    expect(trip?.streams).toHaveLength(1)
    expect(trip?.streams[0]).toMatchObject({ kind: 'gasoline', pricePerUnit: 0, billed: true })
    expect(trip?.people).toEqual([])
  })

  it('drops occupants who refer to people that do not exist', () => {
    const trip = parseTrip({
      people: [{ id: 'ann', name: 'Ann' }],
      segments: [{ kind: 'drive', id: 'd1', occupantIds: ['ann', 'ghost', 42] }],
    })
    expect(trip?.segments[0]?.occupantIds).toEqual(['ann'])
  })

  it('clears a driver who is not on the trip', () => {
    expect(parseTrip({ driverId: 'ghost', people: [] })?.driverId).toBeNull()
  })

  it('discards people without a name and segments that are not objects', () => {
    const trip = parseTrip({ people: [{ id: 'a' }, { id: 'b', name: 'Bo' }], segments: ['nope', 7] })
    expect(trip?.people).toEqual([{ id: 'b', name: 'Bo' }])
    expect(trip?.segments).toEqual([])
  })

  it('replaces non-numeric amounts rather than producing NaN', () => {
    const trip = parseTrip({
      consumptionPer100Km: 'lots',
      receipts: [{ id: 'r1', label: 'Fuel', amount: 'much' }],
    })
    expect(trip?.streams[0]?.consumptionPer100Km).toBe(7)
    expect(trip?.receipts[0]?.amount).toBe(0)
  })

  it('falls back to an even split for an unrecognised allocation', () => {
    const trip = parseTrip({
      overheadCosts: [{ id: 'o1', label: 'Tolls', amount: 100, allocation: { type: 'wat' } }],
    })
    expect(trip?.overheadCosts[0]?.allocation).toEqual({ type: 'even' })
  })
})

describe('createLocalTripStore', () => {
  it('saves, lists and loads a trip', async () => {
    const store = createLocalTripStore(createMemoryStorage())
    const saved = await store.save(makeTrip({ id: 't1', title: 'Alps' }))

    expect(await store.list()).toEqual([
      { id: 't1', title: 'Alps', updatedAt: saved.updatedAt, peopleCount: 3, segmentCount: 0 },
    ])
    expect((await store.load('t1'))?.title).toBe('Alps')
  })

  it('stamps updatedAt on every save', async () => {
    const store = createLocalTripStore(createMemoryStorage())
    const saved = await store.save(makeTrip({ updatedAt: '2020-01-01T00:00:00.000Z' }))
    expect(saved.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('returns null for a trip that is not there', async () => {
    expect(await createLocalTripStore(createMemoryStorage()).load('missing')).toBeNull()
  })

  it('removes a trip', async () => {
    const store = createLocalTripStore(createMemoryStorage())
    await store.save(makeTrip({ id: 't1' }))
    await store.remove('t1')
    expect(await store.list()).toEqual([])
  })

  it('skips a corrupt entry instead of failing the whole list', async () => {
    const storage = createMemoryStorage({
      [`${TRIP_KEY_PREFIX}broken`]: '{not json',
      [`${TRIP_KEY_PREFIX}also-broken`]: '"a string"',
    })
    const store = createLocalTripStore(storage)
    await store.save(makeTrip({ id: 'good', title: 'Good' }))

    const list = await store.list()
    expect(list.map((entry) => entry.id)).toEqual(['good'])
  })

  it('ignores keys belonging to other applications', async () => {
    const store = createLocalTripStore(createMemoryStorage({ 'some-other-app': 'value' }))
    expect(await store.list()).toEqual([])
  })

  it('lists the most recently updated trip first', async () => {
    // Seeded directly, because save() deliberately stamps its own timestamp.
    const storage = createMemoryStorage({
      [`${TRIP_KEY_PREFIX}old`]: JSON.stringify(
        makeTrip({ id: 'old', updatedAt: '2020-01-01T00:00:00.000Z' }),
      ),
      [`${TRIP_KEY_PREFIX}recent`]: JSON.stringify(
        makeTrip({ id: 'recent', updatedAt: '2026-01-01T00:00:00.000Z' }),
      ),
    })

    const list = await createLocalTripStore(storage).list()
    expect(list.map((entry) => entry.id)).toEqual(['recent', 'old'])
  })
})

describe('url sharing', () => {
  const trip = makeTrip({
    title: 'Šumperk → Kunčice',
    segments: [makeDrive({ occupantIds: ['ann', 'bo'] })],
    receipts: [{ id: 'r1', label: 'Nafta', amount: fromMajor(6033.73) }],
  })

  it('round-trips a trip through a token', () => {
    expect(decodeTripFromToken(encodeTripToToken(trip))).toEqual(trip)
  })

  it('survives diacritics', () => {
    const decoded = decodeTripFromToken(encodeTripToToken(trip))
    expect(decoded?.title).toBe('Šumperk → Kunčice')
  })

  it('produces a token that is safe in a URL', () => {
    expect(encodeTripToToken(trip)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('returns null for junk rather than throwing', () => {
    expect(decodeTripFromToken('')).toBeNull()
    expect(decodeTripFromToken('!!!not-base64!!!')).toBeNull()
    expect(decodeTripFromToken(encodeTripToToken(createTrip()).slice(0, 5))).toBeNull()
  })

  it('puts the payload in the fragment, so it never reaches a server log', () => {
    const url = buildCopyUrl('https://trips.example.com/', trip)
    expect(url.startsWith('https://trips.example.com/trip/import#')).toBe(true)
    expect(url.split('#')[0]).not.toContain('Ann')
  })

  it('keeps the view key out of the path, for the same reason', () => {
    const url = buildViewUrl('https://trips.example.com/', 'trip-1', 'k'.repeat(32))
    expect(url).toBe(`https://trips.example.com/view/trip-1#${'k'.repeat(32)}`)
    expect(url.split('#')[0]).not.toContain('k'.repeat(32))
  })
})

describe('trips saved before the app counted anything but litres', () => {
  it('reads the old field names so an existing trip still opens', () => {
    const legacy = {
      title: 'Old trip',
      defaultConsumptionLPer100Km: 9.5,
      pricing: { mode: 'fixed-price', pricePerLiter: 4300 },
      people: [{ id: 'ann', name: 'Ann' }],
      segments: [
        {
          kind: 'drive',
          id: 'd1',
          from: 'A',
          to: 'B',
          distanceKm: 100,
          consumptionLPer100Km: 12,
          occupantIds: ['ann'],
        },
        {
          kind: 'drive',
          id: 'd2',
          from: 'B',
          to: 'C',
          distanceKm: 50,
          directLiters: 4,
          occupantIds: ['ann'],
        },
        { kind: 'idle', id: 'i1', liters: 20, occupantIds: ['ann'] },
      ],
    }

    const trip = parseTrip(legacy)
    const petrol = trip!.streams[0]!.id

    expect(trip?.streams).toHaveLength(1)
    expect(trip?.streams[0]).toMatchObject({
      kind: 'gasoline',
      consumptionPer100Km: 9.5,
      pricePerUnit: 4300,
      billed: true,
    })
    expect(trip?.pricingMode).toBe('fixed-price')
    // The one figure each segment used to hold lands on that single stream.
    expect(trip?.segments[0]).toMatchObject({ consumptionPer100Km: { [petrol]: 12 } })
    expect(trip?.segments[1]).toMatchObject({ directEnergy: { [petrol]: 4 } })
    expect(trip?.segments[2]).toMatchObject({ energy: { [petrol]: 20 } })
  })

  it('assumes petrol, since a trip saved back then had no energy kind', () => {
    expect(parseTrip({ title: 'Old' })?.streams[0]?.kind).toBe('gasoline')
  })

  it('prefers the current field name when both are present', () => {
    const trip = parseTrip({
      consumptionPer100Km: 18,
      defaultConsumptionLPer100Km: 9.5,
      people: [{ id: 'a', name: 'A' }],
      segments: [{ kind: 'idle', id: 'i1', energy: 30, liters: 20, occupantIds: [] }],
    })
    expect(trip?.streams[0]?.consumptionPer100Km).toBe(18)
    expect(trip?.segments[0]).toMatchObject({ energy: { [trip!.streams[0]!.id]: 30 } })
  })

  it('keeps an energy kind it does recognise', () => {
    expect(parseTrip({ energyKind: 'electric' })?.streams[0]?.kind).toBe('electric')
    expect(parseTrip({ energyKind: 'plutonium' })?.streams[0]?.kind).toBe('gasoline')
  })

  it('carries the looked-up price provenance onto the migrated stream', () => {
    const trip = parseTrip({
      energyKind: 'diesel',
      pricing: {
        mode: 'fixed-price',
        pricePerUnit: 4441,
        source: { countryName: 'Czechia', fetchedAt: '2026-08-01', convertedFromGallons: false },
      },
    })
    expect(trip?.streams[0]?.source).toEqual({
      countryName: 'Czechia',
      fetchedAt: '2026-08-01',
      convertedFromGallons: false,
    })
  })

  it('keeps the from-receipts mode a trip was saved in', () => {
    expect(parseTrip({ pricing: { mode: 'from-receipts' } })?.pricingMode).toBe('from-receipts')
  })
})

describe('trips saved before the car could run on two things', () => {
  it('reads a hybrid back exactly as written', () => {
    const trip = parseTrip({
      pricingMode: 'fixed-price',
      streams: [
        { id: 's-petrol', kind: 'gasoline', consumptionPer100Km: 6, pricePerUnit: 3890, billed: true },
        { id: 's-volts', kind: 'electric', consumptionPer100Km: 0, pricePerUnit: 650, billed: false },
      ],
      people: [{ id: 'ann', name: 'Ann' }],
      segments: [
        {
          kind: 'drive',
          id: 'd1',
          from: 'A',
          to: 'B',
          distanceKm: 200,
          consumptionPer100Km: { 's-petrol': 2, 's-volts': 15 },
          occupantIds: ['ann'],
        },
        { kind: 'idle', id: 'i1', energy: { 's-petrol': 0.4, 's-volts': 3.1 }, occupantIds: ['ann'] },
      ],
    })

    expect(trip?.streams.map((stream) => stream.kind)).toEqual(['gasoline', 'electric'])
    expect(trip?.streams[1]?.billed).toBe(false)
    expect(trip?.segments[0]).toMatchObject({ consumptionPer100Km: { 's-petrol': 2, 's-volts': 15 } })
    expect(trip?.segments[1]).toMatchObject({ energy: { 's-petrol': 0.4, 's-volts': 3.1 } })
  })

  it('drops per-segment figures for a stream the trip no longer has', () => {
    const trip = parseTrip({
      streams: [{ id: 's-petrol', kind: 'gasoline', consumptionPer100Km: 6, pricePerUnit: 3890 }],
      people: [{ id: 'ann', name: 'Ann' }],
      segments: [{ kind: 'idle', id: 'i1', energy: { 's-petrol': 1, 's-deleted': 9 }, occupantIds: ['ann'] }],
    })
    expect(trip?.segments[0]).toMatchObject({ energy: { 's-petrol': 1 } })
  })

  it('treats a stream saved before the billed flag as billed', () => {
    const trip = parseTrip({
      streams: [{ id: 's1', kind: 'gasoline', consumptionPer100Km: 6, pricePerUnit: 3890 }],
    })
    expect(trip?.streams[0]?.billed).toBe(true)
  })

  it('always leaves at least one stream, so the trip can be edited back to life', () => {
    expect(parseTrip({ streams: [] })?.streams).toHaveLength(1)
    expect(parseTrip({ streams: ['nonsense', 7] })?.streams).toHaveLength(1)
  })
})
