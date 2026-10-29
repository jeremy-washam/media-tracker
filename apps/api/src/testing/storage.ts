import { URL } from 'node:url'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

const migrations = new URL('../../../../packages/db/migrations/', import.meta.url)
type Value = string | number | null | ArrayBuffer

class Statement {
  private values: readonly Value[] = []
  constructor(
    private readonly statement: StatementSync,
    private readonly check: (values: readonly Value[]) => void,
  ) {}
  bind(...values: readonly Value[]) {
    this.values = values
    return this
  }
  private arguments() {
    return this.values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }
  execute() {
    this.check(this.values)
    return this.statement.run(...this.arguments())
  }
  async run() {
    const result = this.execute()
    return { success: true, meta: { changes: Number(result.changes) } }
  }
  async first<Row>() {
    this.check(this.values)
    return (this.statement.get(...this.arguments()) as Row | undefined) ?? null
  }
  async all<Row>() {
    this.check(this.values)
    return { success: true, results: this.statement.all(...this.arguments()) as Row[] }
  }
}

/** Real SQL and atomic batches, isolated from local/hosted application data. */
export class TestDatabase {
  readonly sqlite = new DatabaseSync(':memory:')
  failNext: RegExp | null = null
  failWhen: ((query: string, values: readonly Value[]) => boolean) | null = null
  constructor() {
    for (const name of readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort())
      this.sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'))
  }
  prepare(query: string) {
    return new Statement(this.sqlite.prepare(query), (values) => {
      if (this.failNext?.test(query) || this.failWhen?.(query, values)) {
        this.failNext = null
        throw new Error('Synthetic database interruption')
      }
    })
  }
  async batch(statements: readonly Statement[]) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((statement) => ({
        success: true,
        meta: { changes: Number(statement.execute().changes) },
      }))
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}

export class TestBucket {
  readonly objects = new Map<string, Uint8Array>()
  async put(key: string, value: string | ArrayBuffer | ArrayBufferView) {
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    this.objects.set(key, bytes.slice())
    return {}
  }
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    let bytes = this.objects.get(key)
    if (!bytes) return null
    if (options?.range)
      bytes = bytes.slice(options.range.offset, options.range.offset + options.range.length)
    const stored = bytes
    return {
      text: async () => new TextDecoder().decode(stored),
      arrayBuffer: async () => stored.slice().buffer,
    }
  }
}

export function seedReaderArticle(database: TestDatabase) {
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
  return { key, now }
}
