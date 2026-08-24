import { createMapyProvider } from '../../src/domain/routing/mapy'
import { createOsrmProvider } from '../../src/domain/routing/osrm'
import type { Fetcher, RouteProvider } from '../../src/domain/routing/types'

/**
 * Pick the mapping service for this deployment.
 *
 * This runs on the server for one reason: the Mapy key must never reach a
 * browser. The client only ever talks to our own endpoints.
 */
export function resolveProvider(mapyApiKey: string): RouteProvider {
  const fetcher = globalThis.fetch as unknown as Fetcher
  return mapyApiKey ? createMapyProvider(fetcher, mapyApiKey) : createOsrmProvider(fetcher)
}
