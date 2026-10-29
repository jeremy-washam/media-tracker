import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./env', () => ({ createCatalogJobsRepository: vi.fn(), createMoviesRepository: vi.fn() }))
import { createCatalogJobsRepository, createMoviesRepository, type Bindings } from './env'
import { processTmdbCatalogRefresh } from './tmdb-catalog'
import { SyncDeferredError } from './sync-budget'
afterEach(() => vi.restoreAllMocks())
describe('TMDB terminal grant stops', () => {
  it('records a budget stop outside the closed data-path guard instead of automatically resuming it', async () => {
    const jobId = '01K8QYJ6Q7G6J0Z3VTXYP5CXDD'
    const native = {} as D1Database
    const dataJobs = {
      find: vi.fn(async () => ({ id: jobId, provider: 'tmdb', state: 'pending', cursor: null })),
      reserve: vi.fn(async () => 7),
      fail: vi.fn(),
    }
    const controlJobs = { fail: vi.fn(async () => true) }
    vi.mocked(createCatalogJobsRepository)
      .mockReturnValueOnce(dataJobs as never)
      .mockReturnValue(controlJobs as never)
    const stop = new SyncDeferredError('TMDB database allowance needs review')
    vi.mocked(createMoviesRepository).mockReturnValue({
      listTmdbEnrichmentCandidates: vi.fn(async () => {
        throw stop
      }),
    } as never)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const env = {
      DB: native,
      AUTH_MODE: 'access',
      SYNC_ENABLED: 'true',
      TMDB_API_READ_TOKEN: 'synthetic-token',
      TMDB_CATALOG_JOB_ID: jobId,
      TMDB_CATALOG_UNTIL: new Date(Date.now() + 3600_000).toISOString(),
      SYNC_BUDGET_UNTIL: new Date(Date.now() + 7200_000).toISOString(),
    } as Bindings
    await expect(
      processTmdbCatalogRefresh(env, {
        operation: 'refresh_tmdb_catalog',
        source: 'tmdb',
        catalogJobId: jobId,
        idempotencyKey: 'synthetic',
      }),
    ).rejects.toBe(stop)
    expect(dataJobs.fail).not.toHaveBeenCalled()
    expect(createCatalogJobsRepository).toHaveBeenLastCalledWith(native, undefined)
    expect(controlJobs.fail).toHaveBeenCalledWith(jobId, 7, 'budget_review', expect.any(String))
  })
})
