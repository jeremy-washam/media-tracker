import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from './env'
import {
  acquireReadwiseArticleContent,
  chunkArticleText,
  extractArticleText,
} from './readwise-content'

const migration = [
  '0001_canonical_ledger.sql',
  '0006_movies_library.sql',
  '0008_articles_library.sql',
  '0009_article_content_search_map.sql',
  '0010_article_content_jobs.sql',
  '0011_article_current_availability.sql',
  '0012_article_content_reliability.sql',
  '0013_article_content_attempts.sql',
]
  .map((name) =>
    readFileSync(
      fileURLToPath(new URL(`../../../packages/db/migrations/${name}`, import.meta.url).href),
      'utf8',
    ),
  )
  .join('\n')

type SqlValue = ArrayBuffer | null | number | string

class Statement {
  #values: readonly SqlValue[] = []
  constructor(private readonly statement: StatementSync) {}
  bind(...values: readonly SqlValue[]) {
    this.#values = values
    return this
  }
  #nodeValues() {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }
  async first<Row>(): Promise<Row | null> {
    return (this.statement.get(...this.#nodeValues()) as Row | undefined) ?? null
  }
  async all<Row>(): Promise<{ results: Row[]; success: true }> {
    return { results: this.statement.all(...this.#nodeValues()) as Row[], success: true }
  }
  async run(): Promise<{ success: true }> {
    this.execute()
    return { success: true }
  }
  execute() {
    this.statement.run(...this.#nodeValues())
  }
}

class Database {
  readonly sqlite = new DatabaseSync(':memory:')
  constructor() {
    this.sqlite.exec(migration)
  }
  prepare(query: string) {
    return new Statement(this.sqlite.prepare(query))
  }
  async batch(statements: readonly Statement[]) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      for (const statement of statements) statement.execute()
      this.sqlite.exec('COMMIT')
      return statements.map(() => ({ success: true as const }))
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}

describe('Reader Article content extraction', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('removes executable markup while preserving readable sections', () => {
    expect(
      extractArticleText(
        '<article><h1>Title &amp; subtitle</h1><script>secret()</script><p>First <b>paragraph</b>.</p><p>Second.</p></article>',
      ),
    ).toBe('Title & subtitle\n\nFirst paragraph.\n\nSecond.')
  })

  it.each([
    '&#1114112;',
    '&#x110000;',
    '&#55296;',
    '&#xDFFF;',
    '&#0;',
    '&#x0;',
    `&#${'9'.repeat(400)};`,
  ])('replaces invalid HTML numeric entity %s without poisoning content extraction', (entity) => {
    expect(extractArticleText(`<p>Before ${entity} after.</p>`)).toBe('Before \uFFFD after.')
  })

  it('preserves valid supplementary Unicode numeric entities', () => {
    expect(extractArticleText('<p>&#128578; &#x1F642; &#65;</p>')).toBe('🙂 🙂 A')
  })

  it('produces exact byte ranges for long ASCII and multibyte paragraphs', async () => {
    const text = `${'longword '.repeat(700)}${'é漢🙂'.repeat(900)}`
    const bytes = new TextEncoder().encode(text)
    const chunks = await chunkArticleText(text)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text)
    for (const chunk of chunks) {
      expect(
        new TextDecoder().decode(bytes.slice(chunk.byteStart, chunk.byteStart + chunk.byteLength)),
      ).toBe(chunk.text)
    }
  })

  it('persists the exact API response before attempting to parse it', async () => {
    const database = new Database()
    const now = '2026-09-20T12:00:00.000Z'
    const key = `readwise-content:readwise-1:doc-1:${now}:a1:e1`
    database.sqlite.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
        VALUES('readwise-1','readwise','Reader','connected','partial','${now}','${now}');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at)
        VALUES('run-1','readwise-1','backfill','running','${now}',NULL);
      INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,
        content_type,byte_length,acquired_at,processing_status)
        VALUES('raw-1','readwise-1','run-1','api_page','page','raw/page.json','${'a'.repeat(64)}',
          'application/json',1,'${now}','processed');
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,
        observed_at,parser_version,disposition,upstream_state)
        VALUES('source-1','raw-1','readwise-1','reader_document','$.results[0]','reader-document:doc-1',
          '${now}','readwise-documents@4','normalized','active');
      INSERT INTO media_items(id,type,title,created_at,updated_at)
        VALUES('article-1','article','Example','${now}','${now}');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,
        connection_id,first_observed_source_record_id,last_observed_source_record_id)
        VALUES('identity-1','article-1','readwise','document_id','doc-1','connection','readwise-1',
          'source-1','source-1');
      INSERT INTO readwise_documents(id,connection_id,document_id,media_item_id,external_identity_id,
        raw_category,subtype,current_location,upstream_state,title,normalized_title,progress_valid,
        reading_time_parser_version,updated_at_source,last_source_record_id,last_observed_at,projection_version)
        VALUES('readwise-doc-1','readwise-1','doc-1','article-1','identity-1','article','article','later',
          'active','Example','example',0,1,'${now}','source-1','${now}',1);
      INSERT INTO article_library_projection(media_item_id,connection_id,readwise_document_id,
        display_title,normalized_title,subtype,progress_valid,opened,in_archive,archive_occurrence_count,
        has_unknown_archive_date,in_queue,queue_inbox,queue_later,queue_shortlist,in_feed,
        current_location,current_available,tag_count,active_highlight_count,content_available,
        source_refreshed_at,projection_version)
        VALUES('article-1','readwise-1','readwise-doc-1','Example','example','article',0,0,0,0,0,
          1,0,1,0,0,'later',1,0,0,0,'${now}',1);
      INSERT INTO article_content_jobs(idempotency_key,connection_id,readwise_document_id,document_id,
        source_updated_at,reservation_id,status,created_at,updated_at)
        VALUES('${key}','readwise-1','readwise-doc-1','doc-1','${now}','run-1','pending','${now}','${now}');
    `)
    const exactResponse = '{"results":['
    const retryResponse = '{"different":'
    let responseIndex = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(responseIndex++ === 0 ? exactResponse : retryResponse, {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const objects = new Map<string, Uint8Array>()
    const bucket = {
      async put(_key: string, value: ArrayBuffer | ArrayBufferView | string) {
        const bytes =
          typeof value === 'string'
            ? new TextEncoder().encode(value)
            : value instanceof ArrayBuffer
              ? new Uint8Array(value)
              : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        objects.set(_key, bytes.slice())
        return {}
      },
    }
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
      SYNC_QUEUE: { send: vi.fn() },
    } as unknown as Bindings

    await expect(
      acquireReadwiseArticleContent(bindings, {
        idempotencyKey: key,
        source: 'readwise',
        operation: 'acquire_article_content',
        connectionId: 'readwise-1',
        documentId: 'doc-1',
      }),
    ).rejects.toThrow()
    await expect(
      acquireReadwiseArticleContent(bindings, {
        idempotencyKey: key,
        source: 'readwise',
        operation: 'acquire_article_content',
        connectionId: 'readwise-1',
        documentId: 'doc-1',
      }),
    ).rejects.toThrow()
    expect([...objects.values()].map((bytes) => new TextDecoder().decode(bytes))).toEqual(
      expect.arrayContaining([exactResponse, retryResponse]),
    )
    expect(
      database.sqlite
        .prepare(
          'SELECT attempt_number,processing_status,processing_error FROM article_content_raw_acquisitions WHERE idempotency_key=? ORDER BY attempt_number',
        )
        .all(key),
    ).toEqual([
      { attempt_number: 1, processing_status: 'failed', processing_error: 'SyntaxError' },
      { attempt_number: 2, processing_status: 'failed', processing_error: 'SyntaxError' },
    ])
    database.sqlite.close()
  })
})
