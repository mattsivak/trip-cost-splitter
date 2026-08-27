import { describe, expect, it } from 'vitest'
import { fromMajor } from '../money/money'
import { createTrip } from '../trip/factories'
import { makeDrive, makeStop, makeTrip } from '../trip/testing'
import { createLocalTripStore, createMemoryStorage, TRIP_KEY_PREFIX } from './localTripStore'
import { bought, ridden } from '../trip/energy'
import { parseTrip } from './serialization'
import {
  buildCopyUrl,
  buildEditUrl,
  buildViewUrl,
  decodeTripFromToken,
  encodeTripToToken,
  readViewFragment,
} from './urlCodec'

describe('parseTrip', () => {
  it('rejects anything that is not an object', () => {
    expect(parseTrip(null)).toBeNull()
    expect(parseTrip('a trip')).toBeNull()
    expect(parseTrip([])).toBeNull()
  })

  it('round-trips a full trip unchanged', () => {
    const trip = makeTrip({ lines: [makeDrive(), makeStop({ occupantIds: ['ann', 'bo'] })] })
    expect(parseTrip(JSON.parse(JSON.stringify(trip)))).toEqual(trip)
  })

  it('fills in defaults for a nearly empty object', () => {
    const trip = parseTrip({ title: 'Bare' })
    expect(trip?.title).toBe('Bare')
    expect(trip?.currency).toBe('Kč')
    expect(trip?.pricing).toEqual({ mode: 'fixed-price', pricePerUnit: 0 })
    expect(trip?.energyKind).toBe('gasoline')
    expect(trip?.people).toEqual([])
  })

  it('drops occupants who refer to people that do not exist', () => {
    const trip = parseTrip({
      people: [{ id: 'ann', name: 'Ann' }],
      lines: [{ kind: 'drive', id: 'd1', occupantIds: ['ann', 'ghost', 42] }],
    })
    expect(ridden(trip?.lines ?? [])[0]?.occupantIds).toEqual(['ann'])
  })

  it('clears a driver who is not on the trip', () => {
    expect(parseTrip({ driverId: 'ghost', people: [] })?.driverId).toBeNull()
  })

  it('discards people without a name and segments that are not objects', () => {
    const trip = parseTrip({ people: [{ id: 'a' }, { id: 'b', name: 'Bo' }], lines: ['nope', 7] })
    expect(trip?.people).toEqual([{ id: 'b', name: 'Bo' }])
    expect(ridden(trip?.lines ?? [])).toEqual([])
  })

  it('replaces non-numeric amounts rather than producing NaN', () => {
    const trip = parseTrip({
      consumptionPer100Km: 'lots',
      lines: [
        { kind: 'buy', funds: 'fuel', allocation: { type: 'even' }, id: 'r1', label: 'Fuel', amount: 'much' },
      ],
    })
    expect(trip?.consumptionPer100Km).toBe(7)
    expect(bought(trip?.lines ?? [])[0]?.amount).toBe(0)
  })

  it('falls back to an even split for an unrecognised allocation', () => {
    const trip = parseTrip({
      lines: [
        { kind: 'buy', funds: 'people', id: 'o1', label: 'Tolls', amount: 100, allocation: { type: 'wat' } },
      ],
    })
    expect(bought(trip?.lines ?? [])[0]?.allocation).toEqual({ type: 'even' })
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
    lines: [
      makeDrive({ occupantIds: ['ann', 'bo'] }),
      {
        kind: 'buy',
        funds: 'fuel',
        allocation: { type: 'even' },
        id: 'r1',
        label: 'Nafta',
        amount: fromMajor(6033.73),
      },
    ],
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

  /** The way back into your own trip from a laptop, or after clearing storage. */
  it('carries the edit key to the wizard, in the fragment too', () => {
    const url = buildEditUrl('https://trips.example.com/', 'trip-1', 'e'.repeat(32))
    expect(url).toBe(`https://trips.example.com/trip/trip-1#${'e'.repeat(32)}`)
    expect(url.split('#')[0]).not.toContain('e'.repeat(32))
  })
})

describe('trips saved before the app counted anything but litres', () => {
  it('reads the old field names so an existing trip still opens', () => {
    const legacy = {
      title: 'Old trip',
      defaultConsumptionLPer100Km: 9.5,
      pricing: { mode: 'fixed-price', pricePerLiter: 4300 },
      people: [{ id: 'ann', name: 'Ann' }],
      lines: [
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
        { kind: 'stop', id: 'i1', liters: 20, occupantIds: ['ann'] },
      ],
    }

    const trip = parseTrip(legacy)
    expect(trip?.consumptionPer100Km).toBe(9.5)
    expect(trip?.pricing).toEqual({ mode: 'fixed-price', pricePerUnit: 4300 })
    expect(ridden(trip?.lines ?? [])[0]).toMatchObject({ consumptionPer100Km: 12 })
    expect(ridden(trip?.lines ?? [])[1]).toMatchObject({ directEnergy: 4 })
    expect(ridden(trip?.lines ?? [])[2]).toMatchObject({ energy: 20 })
  })

  it('assumes petrol, since a trip saved back then had no energy kind', () => {
    expect(parseTrip({ title: 'Old' })?.energyKind).toBe('gasoline')
  })

  it('prefers the current field name when both are present', () => {
    const trip = parseTrip({
      consumptionPer100Km: 18,
      defaultConsumptionLPer100Km: 9.5,
      people: [{ id: 'a', name: 'A' }],
      lines: [{ kind: 'stop', id: 'i1', energy: 30, liters: 20, occupantIds: [] }],
    })
    expect(trip?.consumptionPer100Km).toBe(18)
    expect(ridden(trip?.lines ?? [])[0]).toMatchObject({ energy: 30 })
  })

  it('keeps an energy kind it does recognise', () => {
    expect(parseTrip({ energyKind: 'electric' })?.energyKind).toBe('electric')
    expect(parseTrip({ energyKind: 'plutonium' })?.energyKind).toBe('gasoline')
  })
})

describe('a trip priced by the kilometre', () => {
  it('round-trips the rate and the upkeep', () => {
    const trip = makeTrip({
      pricing: { mode: 'per-km', ratePerKm: 400 },
      maintenancePerKm: 200,
      lines: [makeStop({ charge: { mode: 'money', amount: 12000 }, occupantIds: ['ann'] })],
    })
    expect(parseTrip(JSON.parse(JSON.stringify(trip)))).toEqual(trip)
  })

  it('refuses a negative or nonsense rate rather than billing backwards', () => {
    expect(parseTrip({ pricing: { mode: 'per-km', ratePerKm: -500 } })?.pricing).toEqual({
      mode: 'per-km',
      ratePerKm: 0,
    })
    expect(parseTrip({ pricing: { mode: 'per-km', ratePerKm: 'lots' } })?.pricing).toEqual({
      mode: 'per-km',
      ratePerKm: 0,
    })
  })

  it('treats a trip saved before upkeep existed as charging none', () => {
    expect(parseTrip({ title: 'Old' })?.maintenancePerKm).toBe(0)
    expect(parseTrip({ maintenancePerKm: -300 })?.maintenancePerKm).toBe(0)
    expect(parseTrip({ maintenancePerKm: 'some' })?.maintenancePerKm).toBe(0)
  })

  it('leaves an idle stop without a cost alone, rather than inventing a zero', () => {
    const trip = parseTrip({
      people: [{ id: 'ann', name: 'Ann' }],
      lines: [{ kind: 'stop', id: 'i1', energy: 5, occupantIds: ['ann'] }],
    })
    expect(ridden(trip?.lines ?? [])[0]).not.toHaveProperty('cost')
  })
})

describe('amounts paid in another currency', () => {
  const eurReceipt = {
    kind: 'buy' as const,
    funds: 'fuel' as const,
    id: 'receipt-1',
    label: 'Tankstelle Kufstein',
    amount: 999999,
    date: '2026-08-14',
    foreign: {
      currency: 'EUR',
      originalAmount: 6240,
      rate: 24.21,
      source: { date: '2026-08-14', fetchedAt: '2026-08-25T10:00:00.000Z' },
    },
  }

  it('re-derives the converted amount rather than trusting the stored one', () => {
    // The file claims 9 999,99 Kč; the original and the rate say otherwise,
    // and the pair is the truth.
    const trip = parseTrip({ lines: [eurReceipt] })
    expect(bought(trip?.lines ?? [])[0]?.amount).toBe(Math.round(6240 * 24.21))
    expect(bought(trip?.lines ?? [])[0]?.foreign).toMatchObject({ currency: 'EUR', rate: 24.21 })
  })

  it('keeps which day the rate was for', () => {
    const trip = parseTrip({ lines: [eurReceipt] })
    expect(bought(trip?.lines ?? [])[0]?.foreign?.source?.date).toBe('2026-08-14')
  })

  it('does the same for an overhead cost', () => {
    const trip = parseTrip({
      lines: [
        {
          kind: 'buy',
          funds: 'people',
          id: 'o1',
          label: 'Austria vignette',
          amount: 0,
          foreign: { currency: 'EUR', originalAmount: 1240, rate: 24.21 },
        },
      ],
    })
    expect(bought(trip?.lines ?? [])[0]?.amount).toBe(Math.round(1240 * 24.21))
  })

  it('normalises the currency code', () => {
    const trip = parseTrip({
      lines: [
        {
          kind: 'buy',
          funds: 'fuel',
          allocation: { type: 'even' },
          id: 'r',
          label: 'x',
          amount: 0,
          foreign: {
            kind: 'buy',
            funds: 'fuel',
            allocation: { type: 'even' },
            currency: 'eur',
            originalAmount: 100,
            rate: 2,
          },
        },
      ],
    })
    expect(bought(trip?.lines ?? [])[0]?.foreign?.currency).toBe('EUR')
  })

  it.each([
    ['no rate', { currency: 'EUR', originalAmount: 6240 }],
    ['a zero rate', { currency: 'EUR', originalAmount: 6240, rate: 0 }],
    ['a negative rate', { currency: 'EUR', originalAmount: 6240, rate: -2 }],
    ['a currency that is not a code', { currency: 'Kč', originalAmount: 6240, rate: 24 }],
    ['nothing usable at all', 'euros'],
  ])('drops a foreign block with %s and keeps the stored amount', (_case, foreign) => {
    const trip = parseTrip({
      lines: [
        {
          kind: 'buy',
          funds: 'fuel',
          allocation: { type: 'even' },
          id: 'r',
          label: 'x',
          amount: 5000,
          foreign,
        },
      ],
    })
    expect(bought(trip?.lines ?? [])[0]?.foreign).toBeUndefined()
    expect(bought(trip?.lines ?? [])[0]?.amount).toBe(5000)
  })

  it('leaves a trip with no foreign amounts exactly as it was', () => {
    const trip = parseTrip({
      lines: [
        {
          kind: 'buy',
          funds: 'fuel',
          allocation: { type: 'even' },
          id: 'r',
          label: 'Benzina',
          amount: 124000,
        },
      ],
    })
    expect(bought(trip?.lines ?? [])[0]?.amount).toBe(124000)
    expect(bought(trip?.lines ?? [])[0]?.foreign).toBeUndefined()
  })

  it('round-trips through JSON unchanged', () => {
    const once = parseTrip({ lines: [eurReceipt] })
    const twice = parseTrip(JSON.parse(JSON.stringify(once)))
    expect(bought(twice?.lines ?? [])).toEqual(bought(once?.lines ?? []))
  })
})

describe('who paid for a receipt or a cost', () => {
  const base = {
    title: 'Alps',
    people: [
      { id: 'ann', name: 'Ann' },
      { id: 'bo', name: 'Bo' },
    ],
    driverId: 'ann',
  }

  it('keeps the payer through a save and a load', () => {
    const trip = parseTrip({
      ...base,
      lines: [
        {
          kind: 'buy',
          funds: 'fuel',
          allocation: { type: 'even' },
          id: 'r1',
          label: 'Fuel',
          amount: 40000,
          paidBy: 'bo',
        },
        { kind: 'buy', funds: 'people', id: 'o1', label: 'Toll', amount: 30000, paidBy: 'bo' },
      ],
    })

    expect(bought(trip?.lines ?? [])[0]?.paidBy).toBe('bo')
    expect(bought(trip?.lines ?? [])[0]?.paidBy).toBe('bo')
  })

  /** A payer who has been removed since is dropped, and means the driver again. */
  it('drops a payer who is not on the trip', () => {
    const trip = parseTrip({
      ...base,
      lines: [
        {
          kind: 'buy',
          funds: 'fuel',
          allocation: { type: 'even' },
          id: 'r1',
          label: 'Fuel',
          amount: 40000,
          paidBy: 'gone',
        },
      ],
    })

    expect(bought(trip?.lines ?? [])[0]?.paidBy).toBeUndefined()
  })

  it('leaves a receipt with no payer alone', () => {
    const trip = parseTrip({
      ...base,
      lines: [
        { kind: 'buy', funds: 'fuel', allocation: { type: 'even' }, id: 'r1', label: 'Fuel', amount: 40000 },
      ],
    })
    expect(bought(trip?.lines ?? [])[0]).not.toHaveProperty('paidBy')
  })
})

describe('an expense of either kind', () => {
  const base = { title: 'Alps', people: [{ id: 'ann', name: 'Ann' }], driverId: 'ann' }

  /** A toll paid on the way out is dated like any other expense, and the date
   * is what picks the exchange rate for it. */
  it('keeps the date on an extra, not only on a receipt', () => {
    const trip = parseTrip({
      ...base,
      lines: [
        { kind: 'buy', funds: 'people', id: 'o1', label: 'Vignette', amount: 30000, date: '2026-08-14' },
      ],
    })

    expect(bought(trip?.lines ?? [])[0]?.date).toBe('2026-08-14')
  })

  it('leaves an undated extra alone', () => {
    const trip = parseTrip({
      ...base,
      lines: [{ kind: 'buy', funds: 'people', id: 'o1', label: 'Vignette', amount: 30000 }],
    })
    expect(bought(trip?.lines ?? [])[0]).not.toHaveProperty('date')
  })
})

describe('a payment link that knows who it is for', () => {
  it('carries the person after the key, in the fragment', () => {
    const url = buildViewUrl('https://trips.example.com', 'trip-1', 'k'.repeat(32), 'jana')
    expect(url).toBe(`https://trips.example.com/view/trip-1#${'k'.repeat(32)}.jana`)
  })

  it('is the plain group link when nobody is named', () => {
    const url = buildViewUrl('https://trips.example.com', 'trip-1', 'k'.repeat(32))
    expect(url).toBe(`https://trips.example.com/view/trip-1#${'k'.repeat(32)}`)
  })

  it('reads the key and the person back out', () => {
    expect(readViewFragment(`#${'k'.repeat(32)}.jana`)).toEqual({ key: 'k'.repeat(32), personId: 'jana' })
    expect(readViewFragment('k'.repeat(32))).toEqual({ key: 'k'.repeat(32), personId: '' })
    expect(readViewFragment('')).toEqual({ key: '', personId: '' })
  })

  /** A trimmed or mangled fragment must not be read as a key with a person. */
  it('keeps the key whole when there is no person on the end', () => {
    expect(readViewFragment('#abc.').personId).toBe('')
    expect(readViewFragment('#abc.').key).toBe('abc')
  })
})

describe('a trip written before it was a ledger', () => {
  const legacy = {
    id: 'trip-1',
    title: 'Alps',
    people: [
      { id: 'ann', name: 'Ann' },
      { id: 'bo', name: 'Bo' },
    ],
    driverId: 'ann',
    segments: [
      {
        kind: 'drive',
        id: 'd1',
        label: 'A → B',
        from: 'A',
        to: 'B',
        distanceKm: 100,
        occupantIds: ['ann', 'bo'],
      },
      { kind: 'idle', id: 'i1', label: 'Waiting', location: 'B', energy: 4, occupantIds: ['ann'] },
    ],
    receipts: [{ id: 'r1', label: 'Fuel', amount: 40000, paidBy: 'bo', date: '2026-08-14' }],
    overheadCosts: [{ id: 'o1', label: 'Toll', amount: 30000, allocation: { type: 'even' } }],
  }

  it('reads the drives, the stops and the money as one ordered list', () => {
    const trip = parseTrip(legacy)

    expect(trip?.lines.map((line) => [line.kind, line.id])).toEqual([
      ['drive', 'd1'],
      ['stop', 'i1'],
      ['buy', 'r1'],
      ['buy', 'o1'],
    ])
  })

  it('keeps a receipt as money that pays for the driving', () => {
    const trip = parseTrip(legacy)
    const receipt = trip?.lines.find((line) => line.id === 'r1')

    expect(receipt).toMatchObject({ kind: 'buy', funds: 'fuel', amount: 40000, paidBy: 'bo' })
  })

  it('keeps a toll as money shared between people', () => {
    const trip = parseTrip(legacy)
    const toll = trip?.lines.find((line) => line.id === 'o1')

    expect(toll).toMatchObject({ kind: 'buy', funds: 'people', amount: 30000 })
  })

  it('keeps who was in the car for each drive', () => {
    const trip = parseTrip(legacy)
    const drive = trip?.lines.find((line) => line.id === 'd1')

    expect(drive).toMatchObject({ kind: 'drive', distanceKm: 100, occupantIds: ['ann', 'bo'] })
  })

  /** Written as lines, read as lines, unchanged. */
  it('reads a trip that was already a ledger', () => {
    const trip = parseTrip({
      id: 'trip-2',
      title: 'Alps',
      people: [{ id: 'ann', name: 'Ann' }],
      driverId: 'ann',
      lines: [
        { kind: 'buy', id: 'b1', label: 'Coffee', amount: 12000, funds: 'people' },
        { kind: 'drive', id: 'd9', label: 'B → C', from: 'B', to: 'C', distanceKm: 50, occupantIds: ['ann'] },
      ],
    })

    expect(trip?.lines.map((line) => line.id)).toEqual(['b1', 'd9'])
  })
})
