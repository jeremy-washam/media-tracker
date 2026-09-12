import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiErrorSchema,
  ConnectionsResponseSchema,
  HealthResponseSchema,
  MediaListResponseSchema,
} from '@media-tracker/contracts'

import app from './app'
import type { Bindings } from './env'

const emptyStatement = {
  bind() {
    return this
  },
  async first() {
    return null
  },
  async all() {
    return { results: [], success: true }
  },
  async run() {
    return { success: true }
  },
}

const testBindings = {
  DB: {
    prepare: () => ({ ...emptyStatement }),
    async batch(statements: unknown[]) {
      return statements.map(() => ({ success: true }))
    },
  },
} as unknown as Bindings

describe('API', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a contract-valid health response and request ID', async () => {
    const response = await app.request('/api/health', {
      headers: { 'x-request-id': 'test-request' },
    })
    const payload = HealthResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe('test-request')
    expect(payload.requestId).toBe('test-request')
  })

  it('returns the standard error contract for unknown API routes', async () => {
    const response = await app.request('/api/unknown')
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe('NOT_FOUND')
  })

  it('returns all planned source connection placeholders', async () => {
    const response = await app.request('/api/connections', undefined, testBindings)
    const payload = ConnectionsResponseSchema.parse(await response.json())

    expect(payload.data.map(({ source }) => source)).toEqual([
      'readwise',
      'hardcover',
      'letterboxd',
      'spotify',
      'youtube',
    ])
  })

  it('returns media from the database contract', async () => {
    const response = await app.request('/api/media', undefined, testBindings)
    const payload = MediaListResponseSchema.parse(await response.json())

    expect(payload).toEqual({ data: [], nextCursor: null })
  })

  it('explains when Readwise has not been configured', async () => {
    const response = await app.request(
      '/api/connections/readwise/sync',
      { method: 'POST' },
      testBindings,
    )
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('explains when Letterboxd RSS has not been configured', async () => {
    const response = await app.request(
      '/api/connections/letterboxd/sync',
      { method: 'POST' },
      testBindings,
    )
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('explains when Hardcover has not been configured', async () => {
    const response = await app.request(
      '/api/connections/hardcover/sync',
      { method: 'POST' },
      testBindings,
    )
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('generates an OpenAPI document for the scaffold routes', async () => {
    const response = await app.request('/api/openapi.json')
    const document = (await response.json()) as { paths?: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/api/health')
    expect(document.paths).toHaveProperty('/api/media')
    expect(document.paths).toHaveProperty('/api/connections')
    expect(document.paths).toHaveProperty('/api/connections/readwise/sync')
    expect(document.paths).toHaveProperty('/api/connections/hardcover/sync')
    expect(document.paths).toHaveProperty('/api/connections/letterboxd/import')
    expect(document.paths).toHaveProperty('/api/connections/letterboxd/sync')
    expect(document.paths).toHaveProperty('/api/sync-runs')
  })
})
