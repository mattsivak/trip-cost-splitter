import type { Trip } from '../trip/types'
import { parseTrip } from './serialization'

/**
 * Encode a whole trip into a URL fragment so it can be shared without a
 * server. Base64url keeps it safe in a query string; the fragment (`#`) keeps
 * it out of server logs, which matters because it contains people's names.
 */
export function encodeTripToToken(trip: Trip): string {
  const bytes = new TextEncoder().encode(JSON.stringify(trip))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeTripFromToken(token: string): Trip | null {
  if (!token) return null
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return parseTrip(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}

export function buildShareUrl(origin: string, trip: Trip): string {
  return `${origin.replace(/\/$/, '')}/trip/import#${encodeTripToToken(trip)}`
}
