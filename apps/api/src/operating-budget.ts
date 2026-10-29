import { z } from 'zod'
import type { Bindings } from './env'

export const OPERATING_MONITOR_CRON = '*/10 * * * *'
export const OPERATING_STATE_KEY = 'operations/operating-state.json'
const freshnessMs = 60 * 60_000
const stateSchema = z.object({
  version: z.literal(1),
  checkedAt: z.string().datetime(),
  paused: z.boolean(),
  pausedAt: z.string().datetime().optional(),
  reason: z.enum(['normal', 'warning', 'spend', 'monitor_unavailable', 'manual']),
  estimatedTotalUsd: z.number().finite().nonnegative(),
  windowStart: z.string().datetime(),
  queuePaused: z.boolean(),
})
export type OperatingState = z.infer<typeof stateSchema>
const cache = new WeakMap<R2Bucket, { until: number; state: OperatingState | null }>()

export async function readOperatingState(env: Bindings, now = Date.now()) {
  const cached = cache.get(env.RAW_BUCKET)
  if (cached && cached.until > now) return cached.state
  try {
    const object = await env.RAW_BUCKET.get(OPERATING_STATE_KEY)
    if (!object || object.size > 16_384) return null
    const state = stateSchema.parse(await object.json())
    cache.set(env.RAW_BUCKET, { until: now + 30_000, state })
    return state
  } catch {
    return null
  }
}

/** No D1 access: maintenance responses remain cheap even if API reads caused the trip. */
export async function operatingWorkAllowed(env: Bindings, now = Date.now()) {
  if (env.OPERATING_MONITOR_ENABLED !== 'true') return true
  const state = await readOperatingState(env, now)
  return (
    !!state &&
    !state.paused &&
    Date.parse(state.checkedAt) <= now + 60_000 &&
    now - Date.parse(state.checkedAt) < freshnessMs
  )
}

export interface NativeUsage {
  rowsRead: number
  rowsWritten: number
  requests: number
  cpuTimeUs: number
  queueOperations: number
  r2ClassA: number
  r2ClassB: number
  d1Bytes: number
  r2Bytes: number
}
const quantity = z.number().finite().nonnegative()
const usageSchema = z.object({
  rowsRead: quantity,
  rowsWritten: quantity,
  requests: quantity,
  cpuTimeUs: quantity,
  queueOperations: quantity,
  r2ClassA: quantity,
  r2ClassB: quantity,
  d1Bytes: quantity,
  r2Bytes: quantity,
})

/** Conservative rolling31day estimate, including the existing $5 subscription.
 * Native analytics are delayed; this is an emergency breaker, never an invoice cap.
 * Storage extrapolates current D1 bytes and last-day R2 peaks to a full month. R2 rounds billable units up.
 */
export function estimateOperatingCost(input: NativeUsage) {
  const u = usageSchema.parse(input)
  const over = (value: number, included: number) => Math.max(0, value - included)
  return (
    5 +
    (over(u.rowsRead, 25e9) / 1e6) * 0.001 +
    over(u.rowsWritten, 50e6) / 1e6 +
    (over(u.requests, 10e6) / 1e6) * 0.3 +
    (over(u.cpuTimeUs / 1000, 30e6) / 1e6) * 0.02 +
    (over(u.queueOperations, 1e6) / 1e6) * 0.4 +
    Math.ceil(over(u.r2ClassA, 1e6) / 1e6) * 4.5 +
    Math.ceil(over(u.r2ClassB, 10e6) / 1e6) * 0.36 +
    over(u.d1Bytes / 1e9, 5) * 0.75 +
    Math.ceil(over(u.r2Bytes / 1e9, 10)) * 0.015
  )
}

const aggregate = <T extends z.ZodRawShape>(shape: T) =>
  z.array(z.object({ sum: z.object(shape) })).max(1)
const analyticsSchema = z.object({
  viewer: z.object({
    accounts: z
      .array(
        z.object({
          d1AnalyticsAdaptiveGroups: aggregate({ rowsRead: quantity, rowsWritten: quantity }),
          workersInvocationsAdaptive: aggregate({ requests: quantity, cpuTimeUs: quantity }),
          queueMessageOperationsAdaptiveGroups: aggregate({ billableOperations: quantity }),
          r2OperationsAdaptiveGroups: z
            .array(
              z.object({
                dimensions: z.object({ actionType: z.string().min(1) }),
                sum: z.object({ requests: quantity }),
              }),
            )
            .max(49),
          r2StorageAdaptiveGroups: z
            .array(
              z.object({
                dimensions: z.object({ bucketName: z.string().min(1) }),
                max: z.object({ payloadSize: quantity, metadataSize: quantity }),
              }),
            )
            .max(99),
        }),
      )
      .length(1),
  }),
})

function windowStart(now: number) {
  return new Date(now - 31 * 86_400_000).toISOString()
}

async function api(env: Bindings, path: string, init?: RequestInit) {
  if (!env.OPERATING_API_TOKEN || !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? ''))
    throw new Error('OperatingMonitorConfigurationError')
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    ...init,
    headers: {
      authorization: 'Bearer ' + env.OPERATING_API_TOKEN,
      'content-type': 'application/json',
      ...init?.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('OperatingMonitorHttp' + response.status)
  const payload = (await response.json()) as {
    success?: boolean
    errors?: unknown[]
    result?: unknown
    data?: unknown
  }
  if (payload.success === false || payload.errors?.length)
    throw new Error('OperatingMonitorApiError')
  return payload.result ?? payload.data
}

export async function collectNativeUsage(env: Bindings, now = Date.now()): Promise<NativeUsage> {
  const start = windowStart(now)
  const end = new Date(now).toISOString()
  const id = env.CLOUDFLARE_ACCOUNT_ID
  const range = `datetime_geq:${JSON.stringify(start)},datetime_leq:${JSON.stringify(end)}`
  const query = `query { viewer { accounts(filter:{accountTag:${JSON.stringify(id)}}) {
    d1AnalyticsAdaptiveGroups(limit:2,filter:{date_geq:${JSON.stringify(start.slice(0, 10))},date_leq:${JSON.stringify(end.slice(0, 10))}}){sum{rowsRead rowsWritten}}
    workersInvocationsAdaptive(limit:2,filter:{${range}}){sum{requests cpuTimeUs}}
    queueMessageOperationsAdaptiveGroups(limit:2,filter:{${range}}){sum{billableOperations}}
    r2OperationsAdaptiveGroups(limit:50,filter:{${range}}){dimensions{actionType}sum{requests}}
    r2StorageAdaptiveGroups(limit:100,filter:{datetime_geq:${JSON.stringify(new Date(now - 86400000).toISOString())},datetime_leq:${JSON.stringify(end)}}){dimensions{bucketName}max{payloadSize metadataSize}}
  } } }`
  const account = analyticsSchema.parse(
    await api(env, '/graphql', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  ).viewer.accounts[0]!
  // The database API exposes physical size without querying application rows.
  const databases = z
    .array(z.object({ file_size: quantity }))
    .max(99)
    .parse(await api(env, `/accounts/${id}/d1/database?per_page=100`))
  const sum = (rows: { sum: Record<string, number> }[], key: string) =>
    rows.reduce((n, row) => n + (row.sum?.[key] ?? 0), 0)
  const freeR2 = new Set(['DeleteObject', 'DeleteObjects', 'DeleteBucket', 'AbortMultipartUpload'])
  const classB = new Set(['HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary'])
  let r2ClassA = 0,
    r2ClassB = 0
  for (const row of account.r2OperationsAdaptiveGroups) {
    const action = row.dimensions?.actionType ?? ''
    const requests = row.sum?.requests ?? 0
    if (classB.has(action)) r2ClassB += requests
    else if (!freeR2.has(action)) r2ClassA += requests // Unknown actions conservatively charge A.
  }
  return usageSchema.parse({
    rowsRead: sum(account.d1AnalyticsAdaptiveGroups, 'rowsRead'),
    rowsWritten: sum(account.d1AnalyticsAdaptiveGroups, 'rowsWritten'),
    requests: sum(account.workersInvocationsAdaptive, 'requests'),
    cpuTimeUs: sum(account.workersInvocationsAdaptive, 'cpuTimeUs'),
    queueOperations: sum(account.queueMessageOperationsAdaptiveGroups, 'billableOperations'),
    r2ClassA,
    r2ClassB,
    d1Bytes: databases.reduce((n, db) => n + db.file_size, 0),
    r2Bytes: account.r2StorageAdaptiveGroups.reduce(
      (n, row) => n + (row.max?.payloadSize ?? 0) + (row.max?.metadataSize ?? 0),
      0,
    ),
  })
}

async function saveState(env: Bindings, state: OperatingState, etag?: string) {
  const saved = await env.RAW_BUCKET.put(OPERATING_STATE_KEY, JSON.stringify(state), {
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  })
  cache.delete(env.RAW_BUCKET)
  return saved?.etag
}
async function pauseDelivery(env: Bindings) {
  if (!/^[a-f0-9]{32}$/.test(env.SYNC_QUEUE_ID ?? ''))
    throw new Error('OperatingQueueConfigurationError')
  await api(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/queues/${env.SYNC_QUEUE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({ settings: { delivery_paused: true } }),
  })
}

export async function monitorOperatingBudget(env: Bindings, now = Date.now()) {
  if (env.OPERATING_MONITOR_ENABLED !== 'true') return
  // Read fresh for compare-and-swap: overlapping cron invocations cannot reopen a pause.
  const object = await env.RAW_BUCKET.get(OPERATING_STATE_KEY)
  let previous: OperatingState | null = null
  if (object && object.size <= 16_384) {
    try {
      const parsed = stateSchema.safeParse(await object.json())
      if (parsed.success) previous = parsed.data
    } catch {
      /* Malformed state must be replaced with a closed gate. */
    }
  }
  const invalidExistingState = !!object && previous === null
  let state: OperatingState
  try {
    const usage = await collectNativeUsage(env, now)
    const estimatedTotalUsd = estimateOperatingCost(usage)
    const queue = z
      .object({ settings: z.object({ delivery_paused: z.boolean().default(false) }) })
      .parse(await api(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/queues/${env.SYNC_QUEUE_ID}`))
    const deliveryPaused = queue.settings.delivery_paused
    state = {
      version: 1,
      checkedAt: new Date(now).toISOString(),
      windowStart: windowStart(now),
      estimatedTotalUsd,
      paused:
        invalidExistingState ||
        previous?.paused === true ||
        estimatedTotalUsd >= 25 ||
        deliveryPaused,
      reason: invalidExistingState
        ? 'monitor_unavailable'
        : previous?.paused
          ? previous.reason
          : estimatedTotalUsd >= 25
            ? 'spend'
            : deliveryPaused
              ? 'manual'
              : estimatedTotalUsd >= 10
                ? 'warning'
                : 'normal',
      queuePaused: deliveryPaused,
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'operations.monitor_failed',
        errorName: error instanceof Error ? error.message : 'UnknownError',
      }),
    )
    if (previous && !previous.paused && now - Date.parse(previous.checkedAt) < freshnessMs) return
    state = previous?.paused
      ? previous
      : {
          version: 1,
          checkedAt: new Date(now).toISOString(),
          windowStart: windowStart(now),
          estimatedTotalUsd: previous?.estimatedTotalUsd ?? 5,
          paused: true,
          reason: 'monitor_unavailable',
          queuePaused: false,
        }
  }
  if (state.paused) state.pausedAt = previous?.pausedAt ?? new Date(now).toISOString()
  // Publish the application gate first. Failed queue control cannot reopen API/database work.
  const etag = await saveState(env, state, object?.etag)
  if (!etag) {
    // Another monitor/operator changed state. Never overwrite its newer decision.
    const current = await readOperatingState(env, now)
    if (current?.paused) await pauseDelivery(env)
    return current
  }
  if (state.paused) {
    try {
      await pauseDelivery(env)
      state.queuePaused = true
      await saveState(env, state, etag)
    } catch {
      console.error(JSON.stringify({ event: 'operations.queue_pause_failed' }))
    }
  }
  if (state.reason !== 'normal')
    console.warn(JSON.stringify({ event: 'operations.attention', ...state }))
  return state
}
