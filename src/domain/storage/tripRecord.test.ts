import { describe, expect, it } from 'vitest'
import { makeTrip } from '../trip/testing'
import { accessFor, createKey, createTripRecord, parseTripRecord, TRIP_SCHEMA_VERSION } from './tripRecord'

const now = '2026-08-24T10:00:00.000Z'

describe('createKey', () => {
  it('is 128 bits of hex', () => {
    expect(createKey()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('does not repeat', () => {
    const keys = new Set(Array.from({ length: 500 }, createKey))
    expect(keys.size).toBe(500)
  })
})

describe('createTripRecord', () => {
  it('stamps the schema version, so a later release knows what it is reading', () => {
    expect(createTripRecord(makeTrip(), now).version).toBe(TRIP_SCHEMA_VERSION)
  })

  it('gives out two different keys', () => {
    const record = createTripRecord(makeTrip(), now)
    expect(record.viewKey).not.toBe(record.editKey)
  })
})

describe('accessFor', () => {
  const record = createTripRecord(makeTrip(), now)

  it('recognises the edit key', () => {
    expect(accessFor(record, record.editKey)).toBe('edit')
  })

  it('recognises the view key', () => {
    expect(accessFor(record, record.viewKey)).toBe('view')
  })

  it('grants nothing for a wrong or empty key', () => {
    expect(accessFor(record, 'a'.repeat(32))).toBeNull()
    expect(accessFor(record, '')).toBeNull()
    expect(accessFor(record, '   ')).toBeNull()
    expect(accessFor(record, record.editKey.slice(0, -1))).toBeNull()
  })

  it('does not accept a key that merely starts correctly', () => {
    const nearly = record.editKey.slice(0, 31) + (record.editKey.endsWith('0') ? '1' : '0')
    expect(accessFor(record, nearly)).toBeNull()
  })
})

describe('parseTripRecord', () => {
  it('round-trips a record', () => {
    const record = createTripRecord(makeTrip({ title: 'Alps' }), now)
    expect(parseTripRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
  })

  it('refuses a record without both keys', () => {
    const record = createTripRecord(makeTrip(), now)
    expect(parseTripRecord({ ...record, editKey: '' })).toBeNull()
    expect(parseTripRecord({ ...record, viewKey: undefined })).toBeNull()
  })

  it('refuses anything that is not a record', () => {
    for (const junk of [null, 'nope', 42, [], undefined]) expect(parseTripRecord(junk)).toBeNull()
  })

  it('re-stamps the current version on an older file', () => {
    const record = { ...createTripRecord(makeTrip(), now), version: 0 }
    expect(parseTripRecord(record)?.version).toBe(TRIP_SCHEMA_VERSION)
  })
})

describe('who has paid', () => {
  it('keeps marks against people on the trip', () => {
    const record = createTripRecord(makeTrip({ paidAt: { bo: now } }), now)
    expect(parseTripRecord(JSON.parse(JSON.stringify(record)))?.trip.paidAt).toEqual({ bo: now })
  })

  it('drops marks against people who are not', () => {
    const record = createTripRecord(makeTrip({ paidAt: { ghost: now } }), now)
    expect(parseTripRecord(JSON.parse(JSON.stringify(record)))?.trip.paidAt).toEqual({})
  })
})
