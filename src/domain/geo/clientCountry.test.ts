import { describe, expect, it } from 'vitest'
import {
  clientIpFromHeaders,
  countryFromGeoJs,
  countryFromHeaders,
  geoLookupFor,
  isPublicIp,
} from './clientCountry'

describe('countryFromHeaders', () => {
  it('trusts Cloudflare first', () => {
    expect(countryFromHeaders({ 'cf-ipcountry': 'CZ' })).toBe('CZ')
  })

  it('understands the other common proxies', () => {
    expect(countryFromHeaders({ 'x-vercel-ip-country': 'de' })).toBe('DE')
    expect(countryFromHeaders({ 'x-country-code': 'GB' })).toBe('GB')
  })

  it('prefers Cloudflare when several proxies disagree', () => {
    expect(countryFromHeaders({ 'cf-ipcountry': 'CZ', 'x-vercel-ip-country': 'DE' })).toBe('CZ')
  })

  it('ignores the placeholders proxies send when they do not know', () => {
    for (const unknown of ['XX', 'T1', 'A1', 'ZZ']) {
      expect(countryFromHeaders({ 'cf-ipcountry': unknown })).toBeNull()
    }
  })

  it('ignores anything that is not a country code', () => {
    expect(countryFromHeaders({ 'cf-ipcountry': 'Czechia' })).toBeNull()
    expect(countryFromHeaders({ 'cf-ipcountry': '' })).toBeNull()
    expect(countryFromHeaders({})).toBeNull()
  })

  it('copes with a header arriving as an array', () => {
    expect(countryFromHeaders({ 'cf-ipcountry': ['CZ', 'DE'] })).toBe('CZ')
  })
})

describe('clientIpFromHeaders', () => {
  it('takes the original client from the left of x-forwarded-for', () => {
    expect(clientIpFromHeaders({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })).toBe(
      '203.0.113.7',
    )
  })

  it('falls back through the other headers, then the socket', () => {
    expect(clientIpFromHeaders({ 'cf-connecting-ip': '203.0.113.9' })).toBe('203.0.113.9')
    expect(clientIpFromHeaders({ 'x-real-ip': '203.0.113.10' })).toBe('203.0.113.10')
    expect(clientIpFromHeaders({}, '203.0.113.11')).toBe('203.0.113.11')
  })

  it('unwraps an IPv4-mapped IPv6 address', () => {
    expect(clientIpFromHeaders({}, '::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('returns null when there is nothing to go on', () => {
    expect(clientIpFromHeaders({})).toBeNull()
    expect(clientIpFromHeaders({ 'x-forwarded-for': '   ' })).toBeNull()
  })
})

describe('isPublicIp', () => {
  it('accepts a routable address', () => {
    expect(isPublicIp('203.0.113.7')).toBe(true)
    expect(isPublicIp('2a02:8308::1')).toBe(true)
  })

  it('rejects loopback and LAN addresses, which never resolve', () => {
    for (const local of [
      '127.0.0.1',
      '::1',
      'localhost',
      '10.1.2.3',
      '192.168.1.10',
      '172.16.0.1',
      '172.31.255.1',
      '169.254.1.1',
      '0.0.0.0',
    ]) {
      expect(isPublicIp(local)).toBe(false)
    }
  })

  it('rejects carrier-grade NAT, which geolocates to the carrier at best', () => {
    expect(isPublicIp('100.64.0.1')).toBe(false)
  })

  it('accepts addresses just outside the private ranges', () => {
    expect(isPublicIp('172.15.0.1')).toBe(true)
    expect(isPublicIp('172.32.0.1')).toBe(true)
    expect(isPublicIp('192.169.0.1')).toBe(true)
  })

  it('rejects IPv6 unique-local and link-local', () => {
    expect(isPublicIp('fd00::1')).toBe(false)
    expect(isPublicIp('fe80::1')).toBe(false)
  })

  it('rejects nonsense', () => {
    expect(isPublicIp('')).toBe(false)
    expect(isPublicIp('not an ip')).toBe(false)
    expect(isPublicIp('999.1.1.1')).toBe(false)
  })
})

describe('countryFromGeoJs', () => {
  it('reads the country out of a GeoJS response', () => {
    expect(countryFromGeoJs({ country: 'CZ', country_3: 'CZE', name: 'Czechia' })).toBe('CZ')
  })

  it('returns null for the empty answer GeoJS gives for a private address', () => {
    expect(countryFromGeoJs({ country: '', country_3: '', ip: '127.0.0.1', name: '' })).toBeNull()
  })

  it('returns null for junk', () => {
    for (const junk of [null, undefined, 'CZ', 42, [], {}]) expect(countryFromGeoJs(junk)).toBeNull()
  })
})

describe('geoLookupFor', () => {
  const base = 'https://get.geojs.io/v1/ip/country'

  it('looks up a public client address directly', () => {
    expect(geoLookupFor('203.0.113.7', base)).toEqual({
      url: `${base}/203.0.113.7.json`,
      via: 'client-ip',
    })
  })

  it('asks for our own address when the client is on this machine', () => {
    // Running locally, the visitor and the server are the same machine, so the
    // server's country is the right answer. Skipping the lookup meant the
    // price was never prefilled in development.
    for (const local of ['127.0.0.1', '::1', '192.168.1.10', null]) {
      expect(geoLookupFor(local, base)).toEqual({ url: `${base}.json`, via: 'server-ip' })
    }
  })

  it('escapes the address rather than pasting it into the URL', () => {
    expect(geoLookupFor('203.0.113.7/../evil', base).via).toBe('server-ip')
  })
})
