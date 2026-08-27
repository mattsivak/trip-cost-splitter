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

/** A link that hands the recipient their own editable copy of the trip. */
export function buildCopyUrl(origin: string, trip: Trip): string {
  return `${base(origin)}/trip/import#${encodeTripToToken(trip)}`
}

/**
 * A link to the trip as it stands on the server: amounts, payment links and
 * the working, with no way to change any of it. The key rides in the fragment
 * so it stays out of server logs and Referer headers.
 */
export function buildViewUrl(origin: string, tripId: string, viewKey: string, personId = ''): string {
  const who = personId ? `.${personId}` : ''
  return `${base(origin)}/view/${encodeURIComponent(tripId)}#${viewKey}${who}`
}

/**
 * The other half of that link.
 *
 * A page that knows which of the eight names belongs to the person holding the
 * phone can lead with their amount instead of handing them a collections table
 * to find themselves in. Nothing secret is added: the person is only a hint
 * about who is reading, and the key is what actually opens the trip.
 */
export function readViewFragment(hash: string): { key: string; personId: string } {
  const raw = hash.replace(/^#/, '').trim()
  const dot = raw.indexOf('.')
  if (dot < 0) return { key: raw, personId: '' }
  return { key: raw.slice(0, dot), personId: raw.slice(dot + 1) }
}

/**
 * A link back into your own trip, with the edit key that opens it.
 *
 * The view link is for the group; this one is for you, on your other device or
 * after this browser has forgotten which trips are yours. It grants everything
 * the wizard can do, deleting included, so it is not a link to hand around.
 */
export function buildEditUrl(origin: string, tripId: string, editKey: string): string {
  return `${base(origin)}/trip/${encodeURIComponent(tripId)}#${editKey}`
}

function base(origin: string): string {
  return origin.replace(/\/$/, '')
}
