import type {
  ChatConversation,
  ChatMessage,
  ChatRun,
  ChatRunStatus,
  ChatEvent,
  ChatEventPayload,
  ChatSnapshot,
  ChatPart,
} from '@media-tracker/domain'

/** Synchronous SQLite port: DO storage and the independent node:sqlite test adapter. */
export interface ChatSql {
  exec<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    ...bindings: (string | number | null)[]
  ): Iterable<Row>
  transaction<T>(operation: () => T): T
}
export class ChatConflict extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code)
  }
}
export class SqlChatConversation {
  constructor(private readonly database: ChatSql) {
    database.exec(
      'CREATE TABLE IF NOT EXISTS chat_meta (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)',
    )
    database.exec(
      'CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, sequence INTEGER NOT NULL UNIQUE, run_id TEXT NOT NULL, body TEXT NOT NULL)',
    )
    database.exec(
      'CREATE TABLE IF NOT EXISTS chat_runs (id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE, body TEXT NOT NULL)',
    )
    database.exec(
      'CREATE TABLE IF NOT EXISTS chat_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, body TEXT NOT NULL)',
    )
    database.exec(
      'CREATE TABLE IF NOT EXISTS chat_evidence (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, object_key TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)',
    )
    database.exec(
      'CREATE TABLE IF NOT EXISTS chat_attempts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, body TEXT NOT NULL)',
    )
    database.exec(
      'CREATE TABLE IF NOT EXISTS chat_publication (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0)',
    )
  }
  private value<T>(sql: string, ...args: (string | number | null)[]): T | null {
    const row = [...this.database.exec<{ body: string }>(sql, ...args)][0]
    return row ? (JSON.parse(row.body) as T) : null
  }
  metadata(includeDeleted = false): ChatConversation {
    const result = this.value<ChatConversation>('SELECT body FROM chat_meta WHERE id=1')
    if (!result || (!includeDeleted && result.deletedAt))
      throw new ChatConflict('chat_not_found', 404)
    return result
  }
  private saveMetadata(meta: ChatConversation) {
    this.database.exec(
      'INSERT INTO chat_meta VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
      JSON.stringify(meta),
    )
  }
  private saveMessage(message: ChatMessage) {
    this.database.exec(
      'INSERT INTO chat_messages VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
      message.id,
      message.sequence,
      message.runId,
      JSON.stringify(message),
    )
  }
  private saveRun(run: ChatRun) {
    this.database.exec(
      'INSERT INTO chat_runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
      run.id,
      run.operationKey,
      JSON.stringify(run),
    )
  }
  private event(runId: string | null, payload: ChatEventPayload) {
    this.database.exec(
      'INSERT INTO chat_events(run_id,body) VALUES(?,?)',
      runId,
      JSON.stringify(payload),
    )
  }
  run(id: string) {
    return this.value<ChatRun>('SELECT body FROM chat_runs WHERE id=?', id)
  }
  message(id: string) {
    return this.value<ChatMessage>('SELECT body FROM chat_messages WHERE id=?', id)
  }
  messages(before = Number.MAX_SAFE_INTEGER, limit = 40): ChatMessage[] {
    return [
      ...this.database.exec<{ body: string }>(
        'SELECT body FROM chat_messages WHERE sequence<? ORDER BY sequence DESC LIMIT ?',
        before,
        limit,
      ),
    ]
      .map((row) => JSON.parse(row.body) as ChatMessage)
      .reverse()
  }
  events(after: number, limit = 100): ChatEvent[] {
    return [
      ...this.database.exec<{ sequence: number; run_id: string | null; body: string }>(
        'SELECT sequence,run_id,body FROM chat_events WHERE sequence>? ORDER BY sequence LIMIT ?',
        after,
        limit,
      ),
    ].map((row) => ({
      sequence: row.sequence,
      runId: row.run_id,
      payload: JSON.parse(row.body) as ChatEventPayload,
    }))
  }
  snapshot(before?: number, limit = 40): ChatSnapshot {
    const conversation = this.metadata(),
      messages = this.messages(before, limit)
    const first = messages[0]?.sequence
    const hasOlder = first
      ? [...this.database.exec('SELECT 1 FROM chat_messages WHERE sequence<? LIMIT 1', first)]
          .length > 0
      : false
    return {
      conversation,
      messages,
      activeRun: conversation.activeRunId ? this.run(conversation.activeRunId) : null,
      beforeSequence: hasOlder && first ? first : null,
      lastEventSequence: Number(
        [...this.database.exec('SELECT COALESCE(MAX(sequence),0) sequence FROM chat_events')][0]
          ?.sequence ?? 0,
      ),
    }
  }
  admit(input: {
    conversationId: string
    runId: string
    operationKey: string
    inputHash: string
    text: string
    expectedHeadId: string | null
    expectedTranscriptRevision: number
    userMessageId: string
    assistantMessageId: string
    provider: string
    model: string
    at: string
  }): ChatRun {
    return this.database.transaction(() => {
      const previous = this.value<ChatRun>(
        'SELECT body FROM chat_runs WHERE operation_key=?',
        input.operationKey,
      )
      if (previous) {
        if (previous.inputHash !== input.inputHash)
          throw new ChatConflict('chat_idempotency_conflict')
        this.metadata()
        return previous
      }
      let meta = this.value<ChatConversation>('SELECT body FROM chat_meta WHERE id=1')
      if (meta?.deletedAt) throw new ChatConflict('chat_not_found', 404)
      if (!meta)
        meta = {
          id: input.conversationId,
          title: input.text.replace(/\s+/g, ' ').slice(0, 72),
          titleOrigin: 'fallback',
          favorite: false,
          metadataRevision: 0,
          publicationRevision: 0,
          transcriptRevision: 0,
          headId: null,
          activeRunId: null,
          createdAt: input.at,
          lastActivityAt: input.at,
          deletedAt: null,
        }
      if (meta.id !== input.conversationId) throw new ChatConflict('chat_not_found', 404)
      if (meta.activeRunId) throw new ChatConflict('chat_run_active')
      if (
        meta.headId !== input.expectedHeadId ||
        meta.transcriptRevision !== input.expectedTranscriptRevision
      )
        throw new ChatConflict('chat_head_conflict')
      const sequence =
        Number(
          [...this.database.exec('SELECT COALESCE(MAX(sequence),0) sequence FROM chat_messages')][0]
            ?.sequence ?? 0,
        ) + 1
      const user: ChatMessage = {
        id: input.userMessageId,
        sequence,
        parentId: meta.headId,
        runId: input.runId,
        role: 'user',
        status: 'complete',
        parts: [{ type: 'text', id: 'text', text: input.text }],
        createdAt: input.at,
      }
      const assistant: ChatMessage = {
        id: input.assistantMessageId,
        sequence: sequence + 1,
        parentId: user.id,
        runId: input.runId,
        role: 'assistant',
        status: 'streaming',
        parts: [],
        createdAt: input.at,
      }
      const run: ChatRun = {
        id: input.runId,
        conversationId: meta.id,
        operationKey: input.operationKey,
        inputHash: input.inputHash,
        status: 'queued',
        userMessageId: user.id,
        assistantMessageId: assistant.id,
        provider: input.provider,
        model: input.model,
        createdAt: input.at,
        startedAt: null,
        finishedAt: null,
        errorCode: null,
        inputTokens: 0,
        outputTokens: 0,
        webCalls: 0,
        usageUnknown: false,
        providerResponseId: null,
        checkpointKey: null,
      }
      meta = {
        ...meta,
        headId: assistant.id,
        activeRunId: run.id,
        transcriptRevision: meta.transcriptRevision + 1,
        publicationRevision: meta.publicationRevision + 1,
        lastActivityAt: input.at,
      }
      this.saveMetadata(meta)
      this.saveMessage(user)
      this.saveMessage(assistant)
      this.saveRun(run)
      this.event(run.id, { type: 'metadata', conversation: meta })
      this.event(run.id, { type: 'message', message: user })
      this.event(run.id, { type: 'message', message: assistant })
      this.event(run.id, { type: 'run', run })
      return run
    })
  }
  start(id: string, at: string): ChatRun | null {
    return this.database.transaction(() => {
      const run = this.run(id)
      if (!run || run.status !== 'queued' || this.metadata().activeRunId !== id) return null
      run.status = 'running'
      run.startedAt = at
      run.usageUnknown = false
      this.saveRun(run)
      this.event(id, { type: 'run', run })
      return run
    })
  }
  updateParts(id: string, parts: ChatPart[]): boolean {
    return this.database.transaction(() => {
      const run = this.run(id)
      if (!run || run.status !== 'running') return false
      const meta = this.metadata(true)
      if (meta.deletedAt || meta.activeRunId !== id) return false
      const message = this.message(run.assistantMessageId)
      if (!message) return false
      message.parts = parts
      this.saveMessage(message)
      this.event(id, { type: 'message', message })
      return true
    })
  }
  beginAttempt(id: string, runId: string) {
    this.database.transaction(() => {
      const run = this.run(runId)
      if (!run || run.status !== 'running') throw new ChatConflict('chat_run_inactive')
      this.database.exec(
        'INSERT INTO chat_attempts VALUES(?,?,?)',
        id,
        runId,
        JSON.stringify({ id, runId, status: 'submitted' }),
      )
      run.usageUnknown = true
      this.saveRun(run)
    })
  }
  settleAttempt(id: string, runId: string) {
    this.database.transaction(() => {
      this.database.exec(
        'UPDATE chat_attempts SET body=? WHERE id=?',
        JSON.stringify({ id, runId, status: 'settled' }),
        id,
      )
      const run = this.run(runId)
      if (run) {
        run.usageUnknown =
          [
            ...this.database.exec(
              "SELECT 1 FROM chat_attempts WHERE run_id=? AND json_extract(body,'$.status')<>'settled' LIMIT 1",
              runId,
            ),
          ].length > 0
        this.saveRun(run)
      }
    })
  }
  checkpoint(
    id: string,
    fields: Pick<
      ChatRun,
      'providerResponseId' | 'checkpointKey' | 'inputTokens' | 'outputTokens' | 'webCalls'
    >,
  ) {
    this.database.transaction(() => {
      const run = this.run(id)
      if (!run || run.status !== 'running') return
      Object.assign(run, fields)
      this.saveRun(run)
    })
  }
  finish(
    id: string,
    status: Exclude<ChatRunStatus, 'queued' | 'running'>,
    at: string,
    errorCode: string | null = null,
  ): ChatRun | null {
    return this.database.transaction(() => {
      const run = this.run(id)
      if (!run || !['queued', 'running'].includes(run.status)) return run
      run.status = status
      run.finishedAt = at
      run.errorCode = errorCode
      this.saveRun(run)
      const message = this.message(run.assistantMessageId)
      if (message) {
        message.status = status === 'completed' ? 'complete' : 'partial'
        message.parts = message.parts.map((part) =>
          part.type === 'tool_activity' && part.status === 'running'
            ? { ...part, status: status === 'cancelled' ? 'cancelled' : 'failed', finishedAt: at }
            : part,
        )
        this.saveMessage(message)
        this.event(id, { type: 'message', message })
      }
      const meta = this.metadata(true)
      if (meta.activeRunId === id) {
        meta.activeRunId = null
        meta.lastActivityAt = at
        meta.publicationRevision++
        this.saveMetadata(meta)
        this.event(id, { type: 'metadata', conversation: meta })
      }
      this.event(id, { type: 'run', run })
      return run
    })
  }
  patch(input: {
    expectedMetadataRevision: number
    title?: string | undefined
    favorite?: boolean | undefined
  }): ChatConversation {
    return this.database.transaction(() => {
      const meta = this.metadata()
      if (meta.metadataRevision !== input.expectedMetadataRevision)
        throw new ChatConflict('chat_metadata_conflict')
      if (input.title !== undefined) {
        meta.title = input.title
        meta.titleOrigin = 'manual'
      }
      if (input.favorite !== undefined) meta.favorite = input.favorite
      meta.metadataRevision++
      meta.publicationRevision++
      this.saveMetadata(meta)
      this.event(null, { type: 'metadata', conversation: meta })
      return meta
    })
  }
  generatedTitle(title: string, expectedRevision: number): boolean {
    return this.database.transaction(() => {
      const meta = this.metadata(true)
      if (
        meta.deletedAt ||
        meta.titleOrigin !== 'fallback' ||
        meta.metadataRevision !== expectedRevision
      )
        return false
      meta.title = title.trim().slice(0, 200)
      meta.titleOrigin = 'generated'
      meta.metadataRevision++
      meta.publicationRevision++
      this.saveMetadata(meta)
      this.event(null, { type: 'metadata', conversation: meta })
      return true
    })
  }
  remove(at: string): ChatConversation {
    return this.database.transaction(() => {
      let meta = this.metadata(true)
      if (meta.deletedAt) return meta
      if (meta.activeRunId) this.finish(meta.activeRunId, 'cancelled', at)
      meta = this.metadata(true)
      meta.deletedAt = at
      meta.title = 'Deleted chat'
      meta.favorite = false
      meta.publicationRevision++
      this.saveMetadata(meta)
      return meta
    })
  }
  evidence(id: string) {
    return (
      [
        ...this.database.exec<{ id: string; run_id: string; object_key: string; ready: number }>(
          'SELECT * FROM chat_evidence WHERE id=? AND ready=1',
          id,
        ),
      ][0] ?? null
    )
  }
  registerObject(id: string, runId: string, key: string) {
    this.database.exec(
      'INSERT INTO chat_evidence(id,run_id,object_key,ready,created_at) VALUES(?,?,?,0,?)',
      id,
      runId,
      key,
      Date.now(),
    )
  }
  readyObject(id: string) {
    this.database.exec('UPDATE chat_evidence SET ready=1 WHERE id=?', id)
  }
  cleanupKeys(now: number) {
    return [
      ...this.database.exec<{ object_key: string }>(
        'SELECT object_key FROM chat_evidence WHERE ready=1 OR created_at<? LIMIT 100',
        now - 600_000,
      ),
    ].map((row) => row.object_key)
  }
  forgetObjects(keys: string[]) {
    this.database.transaction(() => {
      for (const key of keys)
        this.database.exec('DELETE FROM chat_evidence WHERE object_key=?', key)
    })
  }
  hasObjects() {
    return [...this.database.exec('SELECT 1 FROM chat_evidence LIMIT 1')].length > 0
  }
  objectKeys(): string[] {
    return [
      ...this.database.exec<{ object_key: string }>('SELECT object_key FROM chat_evidence'),
    ].map((row) => row.object_key)
  }
  purgeOwnedContent() {
    this.database.transaction(() => {
      for (const table of [
        'chat_attempts',
        'chat_messages',
        'chat_events',
        'chat_evidence',
        'chat_runs',
      ])
        this.database.exec(`DELETE FROM ${table}`)
    })
  }
  exportPortable() {
    const conversation = this.metadata(),
      messages = [
        ...this.database.exec<{ body: string }>('SELECT body FROM chat_messages ORDER BY sequence'),
      ].map((row) => JSON.parse(row.body) as ChatMessage)
    const runs = [...this.database.exec<{ body: string }>('SELECT body FROM chat_runs')].map(
      (row) => {
        const run = JSON.parse(row.body) as ChatRun
        return { ...run, providerResponseId: null, checkpointKey: null }
      },
    )
    return { version: 1 as const, conversation, messages, runs }
  }
  /** Offline recovery port. Validate an owner export before calling; never merges a nonempty transcript. */
  restorePortable(archive: ReturnType<SqlChatConversation['exportPortable']>, at: string) {
    this.database.transaction(() => {
      if ([...this.database.exec('SELECT 1 FROM chat_meta')].length)
        throw new ChatConflict('chat_restore_not_empty')
      if (archive.version !== 1 || archive.conversation.deletedAt)
        throw new ChatConflict('chat_restore_invalid')
      const meta = {
        ...archive.conversation,
        activeRunId: null,
        publicationRevision: archive.conversation.publicationRevision + 1,
      }
      for (const message of archive.messages)
        this.saveMessage({
          ...message,
          status: message.status === 'streaming' ? 'partial' : message.status,
        })
      for (const source of archive.runs) {
        const interrupted = source.status === 'running' || source.status === 'queued'
        this.saveRun({
          ...source,
          ...(interrupted
            ? {
                status: 'interrupted' as const,
                finishedAt: at,
                errorCode: 'chat_restored_interruption',
              }
            : {}),
          providerResponseId: null,
          checkpointKey: null,
        })
      }
      this.saveMetadata(meta)
      for (const message of archive.messages)
        this.event(message.runId, { type: 'message', message: this.message(message.id)! })
      this.event(null, { type: 'metadata', conversation: meta })
    })
  }
  publicationNeeded(): ChatConversation | null {
    const meta = this.metadata(true)
    const sent = Number(
      [...this.database.exec('SELECT revision FROM chat_publication WHERE id=1')][0]?.revision ?? 0,
    )
    return meta.publicationRevision > sent ? meta : null
  }
  published(revision: number) {
    this.database.exec(
      'INSERT INTO chat_publication VALUES(1,?) ON CONFLICT(id) DO UPDATE SET revision=MAX(revision,excluded.revision)',
      revision,
    )
  }
}
