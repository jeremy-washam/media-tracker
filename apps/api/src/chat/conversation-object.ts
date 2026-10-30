import { ulid } from 'ulid'
import { z } from 'zod'
import {
  ChatMetadataPatchSchema,
  ChatSendSchema,
  ChatPublicRunSchema,
  ChatConversationIdSchema,
} from '@media-tracker/contracts'
import {
  D1DatabaseClient,
  SqlChatConversation,
  SqlChatIndex,
  ChatConflict,
  type ChatSql,
} from '@media-tracker/db'
import {
  chatRunTerminal,
  type ChatRun,
  type ChatSnapshot,
  type ChatEvent,
} from '@media-tracker/domain'
import type { Bindings } from '../env'
import { operatingWorkAllowed } from '../operating-budget'
import { chatDigest } from './security'
import { OpenAIChatProvider, type ChatProviderResult } from './provider'
import { executeChatTurn, generateChatTitle, type ChatTurnHooks } from './turn'
import { queryChatMedia, getChatMediaDetails } from './tools'

export function publicRun(run: ChatRun | null) {
  return run ? ChatPublicRunSchema.parse(run) : null
}
function publicSnapshot(snapshot: ChatSnapshot) {
  return { ...snapshot, activeRun: publicRun(snapshot.activeRun) }
}
function publicEvent(event: ChatEvent) {
  return {
    ...event,
    payload:
      event.payload.type === 'run'
        ? { type: 'run', run: publicRun(event.payload.run) }
        : event.payload,
  }
}
export function chatConfiguration(env: Bindings) {
  const limit = Number(env.CHAT_CREDIT_LIMIT_USD ?? '0'),
    expiry = Date.parse(env.CHAT_CREDIT_EXPIRES_AT ?? '')
  return {
    enabled:
      !!env.OPENAI_API_KEY &&
      !!env.CHAT_CONVERSATIONS &&
      env.CHAT_ENABLED === 'true' &&
      limit > 0 &&
      Number.isFinite(limit) &&
      limit <= 13 &&
      !!env.CHAT_CREDIT_PERIOD &&
      Number.isFinite(expiry) &&
      Date.now() < expiry,
    provider: 'openai',
    model: 'gpt-6.1-sol',
    creditLimitUsd: limit,
    creditExpiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    capabilities: { reasoningSummaries: true, webSearch: true, library: true, stop: true },
  }
}
function safeFailure(error: unknown) {
  if (error instanceof ChatConflict) return error.code
  if (error instanceof Error && /^chat_[a-z_]+$/.test(error.message)) return error.message
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 429) return 'chat_provider_quota'
    if (error.status === 401 || error.status === 403) return 'chat_provider_access'
  }
  return 'chat_provider_unavailable'
}
/** One application-owned SQLite transcript per chat. Only the authenticated Worker can address it. */
export class ChatConversationObject {
  private readonly repository: SqlChatConversation
  private readonly index: SqlChatIndex
  private controller: AbortController | null = null
  private executing = false
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Bindings,
  ) {
    let depth = 0
    const sql: ChatSql = {
      exec: <Row extends Record<string, unknown>>(
        query: string,
        ...args: (string | number | null)[]
      ) => ctx.storage.sql.exec(query, ...args) as unknown as Iterable<Row>,
      transaction: (operation) => {
        if (depth) return operation()
        return ctx.storage.transactionSync(() => {
          depth++
          try {
            return operation()
          } finally {
            depth--
          }
        })
      },
    }
    this.repository = new SqlChatConversation(sql)
    this.index = new SqlChatIndex(new D1DatabaseClient(env.DB))
    ctx.blockConcurrencyWhile(async () => {
      try {
        const meta = this.repository.metadata(true)
        if (meta.activeRunId) {
          const run = this.repository.run(meta.activeRunId)
          if (run?.status === 'running')
            this.repository.finish(
              run.id,
              'interrupted',
              new Date().toISOString(),
              'chat_interrupted',
            )
          await ctx.storage.setAlarm(Date.now() + 100)
        }
      } catch (error) {
        if (!(error instanceof ChatConflict && error.status === 404)) throw error
      }
    })
  }
  private async publish() {
    const meta = this.repository.publicationNeeded()
    if (meta) {
      await this.index.publish(meta)
      this.repository.published(meta.publicationRevision)
    }
  }
  private async retryPublication() {
    try {
      await this.publish()
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + 30_000)
    }
  }
  private async allowed() {
    if (!chatConfiguration(this.env).enabled) throw new ChatConflict('chat_credit_unavailable', 503)
    if (this.env.SYNC_ENABLED === 'false' || !(await operatingWorkAllowed(this.env)))
      throw new ChatConflict('chat_paused', 503)
  }
  private async object(runId: string, kind: string, value: unknown) {
    const id = `${runId.split('.')[0]}.e_${ulid()}`,
      key = `chat/v1/${runId.split('.')[0]}/${kind}/${id}.json`
    this.repository.registerObject(id, runId, key)
    await this.env.RAW_BUCKET.put(key, JSON.stringify(value), {
      httpMetadata: { contentType: 'application/json' },
    })
    this.repository.readyObject(id)
    if (this.repository.metadata(true).deletedAt) {
      await this.env.RAW_BUCKET.delete(key)
      this.repository.forgetObjects([key])
      throw new ChatConflict('chat_not_found', 404)
    }
    return { id, key }
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname.split('/').filter(Boolean)
    try {
      const conversationId = ChatConversationIdSchema.parse(path[0])
      const action = path[1] ?? ''
      if (request.method === 'POST' && action === 'runs' && !path[2]) {
        const input = ChatSendSchema.parse(await request.json()),
          digest = await chatDigest(input.operationKey),
          runId = `${conversationId}.${Array.from({ length: 26 }, (_, i) => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Number((BigInt('0x' + digest.slice(0, 32)) >> BigInt((25 - i) * 5)) & 31n)]).join('')}`
        // A fixed 26-character Crockford ID is derived from this send's UUID. No ambiguous retry allocates new work.
        const existing = this.repository.run(runId),
          hash = await chatDigest(JSON.stringify(input))
        if (!existing) {
          await this.allowed()
          if (
            !(await this.index.acquireRun(
              runId,
              new Date().toISOString(),
              new Date(Date.now() + 240_000).toISOString(),
            ))
          )
            throw new ChatConflict('chat_concurrency_limit', 429)
        }
        let run: ChatRun
        try {
          run = this.repository.admit({
            conversationId,
            runId,
            operationKey: input.operationKey,
            inputHash: hash,
            text: input.text,
            expectedHeadId: input.expectedHeadId,
            expectedTranscriptRevision: input.expectedTranscriptRevision,
            userMessageId: `m_${digest.slice(0, 30)}u`,
            assistantMessageId: `m_${digest.slice(0, 30)}a`,
            provider: 'openai',
            model: 'gpt-6.1-sol',
            at: new Date().toISOString(),
          })
        } catch (error) {
          if (!existing) await this.index.releaseRun(runId)
          throw error
        }
        if (run.status === 'queued') await this.ctx.storage.setAlarm(Date.now() + 1)
        await this.retryPublication()
        return Response.json(
          { run: publicRun(run), snapshot: publicSnapshot(this.repository.snapshot()) },
          { status: 202 },
        )
      }
      if (request.method === 'DELETE' && !action) {
        const active = this.repository.metadata(true).activeRunId
        const meta = this.repository.remove(new Date().toISOString())
        this.controller?.abort()
        if (active) await this.index.releaseRun(active)
        await this.ctx.storage.setAlarm(Date.now() + 1)
        return Response.json({ conversation: meta, cleanup: 'pending' }, { status: 202 })
      }
      this.repository.metadata()
      if (request.method === 'PATCH' && !action) {
        const meta = this.repository.patch(ChatMetadataPatchSchema.parse(await request.json()))
        await this.retryPublication()
        return Response.json(meta)
      }
      if (request.method === 'GET' && !action) {
        const before = url.searchParams.get('before')
        const snapshot = this.repository.snapshot(
          before ? z.coerce.number().int().positive().parse(before) : undefined,
        )
        return Response.json({
          ...publicSnapshot(snapshot),
          latestRun: publicRun(
            snapshot.messages.at(-1) ? this.repository.run(snapshot.messages.at(-1)!.runId) : null,
          ),
        })
      }
      if (action === 'runs' && path[2]) {
        const run = this.repository.run(path[2])
        if (!run) throw new ChatConflict('chat_run_not_found', 404)
        if (request.method === 'POST' && path[3] === 'cancel') {
          const terminal = this.repository.finish(run.id, 'cancelled', new Date().toISOString())
          this.controller?.abort()
          await this.index.releaseRun(run.id)
          await this.retryPublication()
          return Response.json({
            run: publicRun(terminal),
            snapshot: publicSnapshot(this.repository.snapshot()),
          })
        }
        if (request.method === 'GET' && path[3] === 'events') return this.observe(request, run.id)
        if (request.method === 'GET' && !path[3]) return Response.json(publicRun(run))
      }
      if (action === 'evidence' && request.method === 'GET' && path[2]) {
        const record = this.repository.evidence(path[2])
        if (!record || !record.object_key.includes('/evidence/'))
          throw new ChatConflict('chat_evidence_not_found', 404)
        const object = await this.env.RAW_BUCKET.get(record.object_key)
        if (!object) throw new ChatConflict('chat_evidence_unavailable', 404)
        return new Response(object.body, {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      }
      if (action === 'export' && request.method === 'GET') {
        const repository = this.repository,
          meta = repository.metadata(),
          bucket = this.env.RAW_BUCKET,
          encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ format: 'imladris-chat', version: 1, conversation: meta }) +
                    '\n',
                ),
              )
              let before = Number.MAX_SAFE_INTEGER
              while (true) {
                repository.metadata()
                const messages = repository.messages(before, 100)
                if (!messages.length) break
                for (const message of messages) {
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ type: 'message', message }) + '\n'),
                  )
                  if (message.role === 'assistant')
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({
                          type: 'run',
                          run: repository.run(message.runId)
                            ? {
                                ...repository.run(message.runId)!,
                                providerResponseId: null,
                                checkpointKey: null,
                              }
                            : null,
                        }) + '\n',
                      ),
                    )
                }
                before = messages[0]!.sequence
              }
              for (const key of repository.objectKeys().filter((x) => x.includes('/evidence/'))) {
                repository.metadata()
                const object = await bucket.get(key)
                if (object)
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: 'evidence',
                        id: key.split('/').at(-1)?.replace('.json', ''),
                        content: await object.json(),
                      }) + '\n',
                    ),
                  )
              }
              controller.close()
            } catch {
              controller.error(new Error('chat_export_interrupted'))
            }
          },
        })
        return new Response(stream, {
          headers: {
            'content-type': 'application/x-ndjson',
            'content-disposition': `attachment; filename="${meta.id}.ndjson"`,
            'cache-control': 'no-store',
          },
        })
      }
      return Response.json({ error: 'chat_route_not_found' }, { status: 404 })
    } catch (error) {
      return Response.json(
        { error: error instanceof z.ZodError ? 'chat_invalid_request' : safeFailure(error) },
        {
          status:
            error instanceof ChatConflict ? error.status : error instanceof z.ZodError ? 400 : 503,
        },
      )
    }
  }
  private observe(request: Request, runId: string) {
    const url = new URL(request.url)
    let after = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(
        Math.max(
          Number(url.searchParams.get('after') ?? 0),
          Number(request.headers.get('last-event-id') ?? 0),
        ),
      )
    const encoder = new TextEncoder(),
      repository = this.repository,
      stop = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    request.signal.addEventListener('abort', () => stop.abort(), { once: true })
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const pump = () => {
          if (stop.signal.aborted) {
            controller.close()
            return
          }
          try {
            repository.metadata()
            const events = repository.events(after, 100)
            for (const event of events) {
              controller.enqueue(
                encoder.encode(
                  `id: ${event.sequence}\ndata: ${JSON.stringify(publicEvent(event))}\n\n`,
                ),
              )
              after = event.sequence
            }
            const run = repository.run(runId)
            if ((!run || chatRunTerminal(run.status)) && events.length < 100) {
              controller.close()
              return
            }
            controller.enqueue(encoder.encode(': keepalive\n\n'))
            timer = setTimeout(pump, 1000)
          } catch {
            controller.close()
          }
        }
        pump()
      },
      cancel: () => {
        stop.abort()
        if (timer) clearTimeout(timer)
      },
    })
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    })
  }
  async alarm() {
    if (this.executing) return
    this.executing = true
    let deletingAtEntry = false
    try {
      const meta = this.repository.metadata(true)
      deletingAtEntry = !!meta.deletedAt
      if (meta.deletedAt) {
        if (meta.activeRunId) await this.index.releaseRun(meta.activeRunId)
        await this.publish()
        const keys = this.repository.cleanupKeys(Date.now())
        if (keys.length) {
          await this.env.RAW_BUCKET.delete(keys)
          this.repository.forgetObjects(keys)
        }
        if (this.repository.hasObjects()) await this.ctx.storage.setAlarm(Date.now() + 30_000)
        else this.repository.purgeOwnedContent()
        return
      }
      const run = meta.activeRunId ? this.repository.run(meta.activeRunId) : null
      if (run?.status === 'queued') await this.execute(run)
      else if (run?.status === 'running') {
        this.repository.finish(run.id, 'interrupted', new Date().toISOString(), 'chat_interrupted')
        await this.index.releaseRun(run.id)
      }
      await this.publish()
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + 30_000)
    } finally {
      this.executing = false
      const latest = this.repository.metadata(true)
      if (
        (latest.deletedAt && !deletingAtEntry) ||
        (latest.activeRunId && this.repository.run(latest.activeRunId)?.status === 'queued')
      )
        await this.ctx.storage.setAlarm(Date.now() + 100)
    }
  }
  private async execute(queued: ChatRun) {
    const run = this.repository.start(queued.id, new Date().toISOString())
    if (!run) return
    this.controller = new AbortController()
    const controller = this.controller,
      timer = setTimeout(() => controller.abort('deadline'), 180_000)
    // A durable watchdog remains if this alarm is interrupted. Running work is never automatically resubmitted.
    await this.ctx.storage.setAlarm(Date.now() + 210_000)
    const provider = new OpenAIChatProvider(this.env.OPENAI_API_KEY!)
    let totals = { inputTokens: 0, outputTokens: 0, webCalls: 0 }
    const hooks: ChatTurnHooks = {
      now: () => new Date().toISOString(),
      checkAllowed: async () => {
        controller.signal.throwIfAborted()
        if (this.repository.run(run.id)?.status !== 'running')
          throw new ChatConflict('chat_run_inactive')
        await this.allowed()
      },
      reserve: async (id, amount) => {
        if (
          !(await this.index.reserve({
            id,
            period: this.env.CHAT_CREDIT_PERIOD!,
            runId: run.id,
            amount,
            limit: Math.floor(Number(this.env.CHAT_CREDIT_LIMIT_USD) * 1_000_000),
            at: new Date().toISOString(),
          }))
        )
          throw new ChatConflict('chat_credit_limit', 429)
        this.repository.beginAttempt(id, run.id)
      },
      settle: async (id, amount) => {
        await this.index.settle(id, amount)
        this.repository.settleAttempt(id, run.id)
      },
      parts: (parts) => {
        this.repository.updateParts(run.id, parts)
      },
      checkpoint: async (result: ChatProviderResult) => {
        const object = await this.object(run.id, 'checkpoints', result.raw)
        totals = {
          inputTokens: totals.inputTokens + result.inputTokens,
          outputTokens: totals.outputTokens + result.outputTokens,
          webCalls: totals.webCalls + result.webCalls,
        }
        this.repository.checkpoint(run.id, {
          ...totals,
          providerResponseId: result.id,
          checkpointKey: object.key,
        })
      },
      tool: (name, args) =>
        name === 'query_media'
          ? queryChatMedia(this.env, args)
          : getChatMediaDetails(this.env, args),
      evidence: async (callId, args, result) =>
        (
          await this.object(run.id, 'evidence', {
            callId,
            arguments: args,
            result,
            at: new Date().toISOString(),
          })
        ).id,
    }
    try {
      await hooks.checkAllowed()
      const result = await executeChatTurn({
        runId: run.id,
        provider,
        messages: this.repository
          .messages(Number.MAX_SAFE_INTEGER, 40)
          .filter((x) => x.id !== run.assistantMessageId),
        signal: controller.signal,
        hooks,
      })
      this.repository.updateParts(run.id, result.parts)
      this.repository.finish(run.id, 'completed', new Date().toISOString())
    } catch (error) {
      const status = controller.signal.aborted ? 'interrupted' : 'failed'
      this.repository.finish(
        run.id,
        status,
        new Date().toISOString(),
        controller.signal.aborted ? 'chat_interrupted' : safeFailure(error),
      )
    } finally {
      clearTimeout(timer)
      this.controller = null
    }
    try {
      await this.publish()
      // Naming is an optional, once-only auxiliary request. Its reservation cannot bypass the global credit cap.
      const meta = this.repository.metadata(true)
      if (
        !meta.deletedAt &&
        meta.titleOrigin === 'fallback' &&
        this.repository.run(run.id)?.status === 'completed' &&
        this.repository.message(run.userMessageId)?.sequence === 1
      ) {
        try {
          const title = await generateChatTitle({
            runId: run.id,
            text: this.repository
              .message(run.userMessageId)!
              .parts.filter((x) => x.type === 'text')
              .map((x) => x.text)
              .join(''),
            provider,
            signal: AbortSignal.timeout(20_000),
            hooks: {
              checkAllowed: () => this.allowed(),
              reserve: async (id, amount) => {
                if (
                  !(await this.index.reserve({
                    id,
                    period: this.env.CHAT_CREDIT_PERIOD!,
                    runId: run.id,
                    amount,
                    limit: Math.floor(Number(this.env.CHAT_CREDIT_LIMIT_USD) * 1_000_000),
                    at: new Date().toISOString(),
                  }))
                )
                  throw new ChatConflict('chat_credit_limit', 429)
              },
              settle: (id, amount) => this.index.settle(id, amount),
            },
          })
          if (title) this.repository.generatedTitle(title, meta.metadataRevision)
        } catch {
          /* A failed optional title keeps the fallback and its unknown-cost reservation. */
        }
      }
    } finally {
      await this.index.releaseRun(run.id)
    }
  }
}
