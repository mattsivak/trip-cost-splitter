import type { GeoPoint, RoutePlan } from '~/src/domain/routing/types'

interface GeocodeResponse {
  provider: string
  results: GeoPoint[]
}

/**
 * Talks to our own endpoints, never to a mapping service directly. That is
 * what keeps the Mapy key on the server.
 */
export function useRouting() {
  const busy = ref(false)
  const error = ref('')

  async function call<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
    busy.value = true
    error.value = ''
    try {
      return (await $fetch<T>(path, { method: 'POST', body })) as T
    } catch (caught) {
      error.value = messageFrom(caught)
      return null
    } finally {
      busy.value = false
    }
  }

  return {
    busy,
    error,
    async geocode(query: string) {
      return call<GeocodeResponse>('/api/routing/geocode', { query })
    },
    async route(points: readonly GeoPoint[]) {
      return call<RoutePlan>('/api/routing/route', { points })
    },
  }
}

function messageFrom(caught: unknown): string {
  const message = (caught as { statusMessage?: string; message?: string })?.statusMessage
  return message || 'Could not reach the map service. Enter the distances by hand instead.'
}
