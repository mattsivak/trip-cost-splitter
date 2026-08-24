import { describe, expect, it } from 'vitest'
import { createMapyProvider } from './mapy'
import { createOsrmProvider } from './osrm'
import { routeToSegments, slugify } from './routeToSegments'
import { RoutingError, type Fetcher, type GeoPoint } from './types'

/** Serves recorded responses so these tests never touch the network. */
function stubFetcher(
  responses: Array<{ ok?: boolean; status?: number; body: unknown }>,
): Fetcher & { urls: string[] } {
  const urls: string[] = []
  let call = 0
  const fetcher = (async (url: string) => {
    urls.push(url)
    const next = responses[Math.min(call, responses.length - 1)]
    call += 1
    return {
      ok: next?.ok ?? true,
      status: next?.status ?? 200,
      json: async () => next?.body,
    }
  }) as Fetcher & { urls: string[] }
  fetcher.urls = urls
  return fetcher
}

const sumperk: GeoPoint = { label: 'Šumperk', lat: 49.9653, lon: 16.9706 }
const olomouc: GeoPoint = { label: 'Olomouc', lat: 49.5938, lon: 17.2509 }

describe('OSRM provider', () => {
  it('maps Nominatim hits to labelled points', async () => {
    const fetcher = stubFetcher([
      {
        body: [
          {
            name: 'Šumperk',
            display_name: 'Šumperk, okres Šumperk, Olomoucký kraj, Česko',
            lat: '49.9653',
            lon: '16.9706',
          },
        ],
      },
    ])

    const results = await createOsrmProvider(fetcher).geocode('Šumperk')
    expect(results).toEqual([
      { label: 'Šumperk', lat: 49.9653, lon: 16.9706, detail: 'okres Šumperk, Olomoucký kraj' },
    ])
  })

  it('skips hits without usable coordinates', async () => {
    const fetcher = stubFetcher([{ body: [{ name: 'Nowhere', lat: 'abc', lon: '' }] }])
    expect(await createOsrmProvider(fetcher).geocode('nowhere')).toEqual([])
  })

  it('does not call out for an empty query', async () => {
    const fetcher = stubFetcher([{ body: [] }])
    expect(await createOsrmProvider(fetcher).geocode('   ')).toEqual([])
    expect(fetcher.urls).toEqual([])
  })

  it('turns an OSRM response into per-leg distances', async () => {
    const fetcher = stubFetcher([
      {
        body: {
          code: 'Ok',
          routes: [{ distance: 65200, duration: 3600, legs: [{ distance: 65200, duration: 3600 }] }],
        },
      },
    ])

    const plan = await createOsrmProvider(fetcher).route([sumperk, olomouc])
    expect(plan.provider).toBe('osrm')
    expect(plan.totalDistanceKm).toBe(65.2)
    expect(plan.legs).toEqual([
      { fromLabel: 'Šumperk', toLabel: 'Olomouc', distanceKm: 65.2, durationSeconds: 3600 },
    ])
  })

  it('sends coordinates as lon,lat, which is the order OSRM expects', async () => {
    const fetcher = stubFetcher([{ body: { code: 'Ok', routes: [{ distance: 0, legs: [] }] } }])
    await createOsrmProvider(fetcher).route([sumperk, olomouc])
    expect(fetcher.urls[0]).toContain('/16.9706,49.9653;17.2509,49.5938')
  })

  it('refuses a route with fewer than two places', async () => {
    const provider = createOsrmProvider(stubFetcher([{ body: {} }]))
    await expect(provider.route([sumperk])).rejects.toThrow(RoutingError)
  })

  it('reports a routing failure instead of returning zeros', async () => {
    const provider = createOsrmProvider(stubFetcher([{ body: { code: 'NoRoute' } }]))
    await expect(provider.route([sumperk, olomouc])).rejects.toThrow(/No route found/)
  })

  it('reports an HTTP failure', async () => {
    const provider = createOsrmProvider(stubFetcher([{ ok: false, status: 429, body: {} }]))
    await expect(provider.geocode('Olomouc')).rejects.toThrow(/429/)
  })
})

describe('Mapy provider', () => {
  it('refuses to exist without a key', () => {
    expect(() => createMapyProvider(stubFetcher([{ body: {} }]), '')).toThrow(RoutingError)
  })

  it('maps Mapy items to labelled points', async () => {
    const fetcher = stubFetcher([
      {
        body: {
          items: [{ name: 'Olomouc', location: 'Olomoucký kraj', position: { lat: 49.5938, lon: 17.2509 } }],
        },
      },
    ])

    const results = await createMapyProvider(fetcher, 'key-123').geocode('Olomouc')
    expect(results).toEqual([{ label: 'Olomouc', lat: 49.5938, lon: 17.2509, detail: 'Olomoucký kraj' }])
  })

  it('asks for one route per consecutive pair of stops', async () => {
    const fetcher = stubFetcher([{ body: { length: 65200, duration: 3600 } }])
    const plan = await createMapyProvider(fetcher, 'key-123').route([sumperk, olomouc, sumperk])

    expect(fetcher.urls).toHaveLength(2)
    expect(plan.legs).toHaveLength(2)
    expect(plan.totalDistanceKm).toBe(130.4)
    expect(plan.totalDurationSeconds).toBe(7200)
  })

  it('keeps the key in the request and out of the result', async () => {
    const fetcher = stubFetcher([{ body: { length: 100 } }])
    const plan = await createMapyProvider(fetcher, 'secret-key').route([sumperk, olomouc])
    expect(fetcher.urls[0]).toContain('apikey=secret-key')
    expect(JSON.stringify(plan)).not.toContain('secret-key')
  })

  it('fails loudly when a pair has no route', async () => {
    const provider = createMapyProvider(stubFetcher([{ body: {} }]), 'key-123')
    await expect(provider.route([sumperk, olomouc])).rejects.toThrow(/No route found/)
  })
})

describe('routeToSegments', () => {
  const plan = {
    provider: 'osrm' as const,
    totalDistanceKm: 65.2,
    legs: [{ fromLabel: 'Šumperk', toLabel: 'Olomouc', distanceKm: 65.2, durationSeconds: 3600 }],
  }

  it('produces editable drive segments that record where the distance came from', () => {
    const [segment] = routeToSegments(plan, ['ann'])
    expect(segment).toEqual({
      kind: 'drive',
      id: 'leg-1-sumperk-olomouc',
      label: 'Šumperk → Olomouc',
      from: 'Šumperk',
      to: 'Olomouc',
      distanceKm: 65.2,
      distanceSource: 'osrm',
      occupantIds: ['ann'],
      durationSeconds: 3600,
    })
  })

  it('does not share the occupant array between segments', () => {
    const segments = routeToSegments({ ...plan, legs: [plan.legs[0]!, plan.legs[0]!] }, ['ann'])
    segments[0]!.occupantIds.push('bo')
    expect(segments[1]!.occupantIds).toEqual(['ann'])
  })
})

describe('slugify', () => {
  it('strips Czech diacritics', () => {
    expect(slugify('Kunčice pod Ondřejníkem')).toBe('kuncice-pod-ondrejnikem')
  })

  it('always returns something usable as an id', () => {
    expect(slugify('—')).toBe('stop')
    expect(slugify('')).toBe('stop')
  })
})

describe('abort support', () => {
  it('passes the signal through so a stale lookup can be cancelled', async () => {
    const seen: Array<AbortSignal | undefined> = []
    const fetcher: Fetcher = async (_url, init) => {
      seen.push(init?.signal)
      return { ok: true, status: 200, json: async () => [] }
    }
    const controller = new AbortController()
    await createOsrmProvider(fetcher).geocode('Olomouc', controller.signal)
    expect(seen[0]).toBe(controller.signal)
  })
})
