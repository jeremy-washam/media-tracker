import { DatabaseSync } from 'node:sqlite'
import { describe, it, expect } from 'vitest'
import { SqlChatConversation, ChatConflict, type ChatSql } from './chat-conversation'
import { SqlChatIndex } from './chat-index'
import { SqlChatMedia, chatCalendarInstant } from './chat-media'
import { applyTestMigrations, SqliteTestClient } from './test-support/sqlite'

function local() {
  const database = new DatabaseSync(':memory:')
  let depth = 0
  const sql: ChatSql = {
    exec: <Row extends Record<string, unknown>>(
      query: string,
      ...args: (string | number | null)[]
    ) => database.prepare(query).all(...args) as Row[],
    transaction: (operation) => {
      if (depth) return operation()
      database.exec('BEGIN')
      depth++
      try {
        const result = operation()
        database.exec('COMMIT')
        return result
      } catch (e) {
        database.exec('ROLLBACK')
        throw e
      } finally {
        depth--
      }
    },
  }
  return { database, repository: new SqlChatConversation(sql) }
}
const cid = `c_${'a'.repeat(32)}`,
  rid = `${cid}.01K00000000000000000000001`,
  at = '2026-10-30T12:00:00.000Z'
const admission = {
  conversationId: cid,
  runId: rid,
  operationKey: 'first',
  inputHash: 'hash',
  text: 'A question',
  expectedHeadId: null,
  expectedTranscriptRevision: 0,
  userMessageId: 'user-1',
  assistantMessageId: 'assistant-1',
  provider: 'example',
  model: 'portable-model',
  at,
}
describe('application-owned chat persistence', () => {
  it('commits admission atomically and deduplicates only the identical operation', () => {
    const { repository, database } = local()
    const run = repository.admit(admission)
    expect(repository.admit(admission)).toEqual(run)
    expect(repository.snapshot().messages).toHaveLength(2)
    expect(() => repository.admit({ ...admission, inputHash: 'changed' })).toThrow(
      'chat_idempotency_conflict',
    )
    expect(() =>
      repository.admit({ ...admission, operationKey: 'second', runId: rid + '2' }),
    ).toThrow('chat_run_active')
    expect(repository.snapshot().lastEventSequence).toBe(4)
    database.close()
  })
  it('keeps metadata CAS independent of the transcript and fences Stop against late callbacks', () => {
    const { repository, database } = local()
    repository.admit(admission)
    repository.patch({ expectedMetadataRevision: 0, favorite: true })
    expect(() => repository.patch({ expectedMetadataRevision: 0, title: 'stale' })).toThrow(
      'chat_metadata_conflict',
    )
    expect(repository.start(rid, at)?.status).toBe('running')
    repository.beginAttempt('attempt', rid)
    expect(repository.run(rid)?.usageUnknown).toBe(true)
    repository.updateParts(rid, [{ type: 'text', id: 'part', text: 'Partial answer' }])
    repository.finish(rid, 'cancelled', at)
    expect(repository.updateParts(rid, [{ type: 'text', id: 'part', text: 'Late answer' }])).toBe(
      false,
    )
    expect(repository.finish(rid, 'completed', at)?.status).toBe('cancelled')
    expect(repository.snapshot().messages.at(-1)?.parts).toEqual([
      { type: 'text', id: 'part', text: 'Partial answer' },
    ])
    expect(repository.snapshot().conversation.favorite).toBe(true)
    expect(repository.snapshot().conversation.transcriptRevision).toBe(1)
    database.close()
  })
  it('reopens queued work, preserves unknown submissions, and never resurrects a tombstone', () => {
    const { repository, database } = local()
    repository.admit(admission)
    repository.start(rid, at)
    repository.beginAttempt('first-attempt', rid)
    repository.finish(rid, 'interrupted', at)
    expect(repository.run(rid)?.usageUnknown).toBe(true)
    repository.patch({ expectedMetadataRevision: 0, title: 'Owner title' })
    expect(repository.generatedTitle('Late title', 0)).toBe(false)
    repository.remove(at)
    repository.purgeOwnedContent()
    expect(() => repository.metadata()).toThrow(ChatConflict)
    expect(() => repository.admit(admission)).toThrow('chat_not_found')
    expect(repository.metadata(true).deletedAt).toBe(at)
    database.close()
  })
  it('restores portable records into a fresh SQLite adapter and preserves retained partial history', () => {
    const first = local(),
      second = local()
    first.repository.admit(admission)
    first.repository.start(rid, at)
    first.repository.updateParts(rid, [{ type: 'text', id: 'answer', text: 'Retained partial' }])
    const archive = first.repository.exportPortable()
    second.repository.restorePortable(archive, at)
    expect(second.repository.snapshot().messages.at(-1)?.parts).toEqual([
      { type: 'text', id: 'answer', text: 'Retained partial' },
    ])
    expect(second.repository.run(rid)?.status).toBe('interrupted')
    expect(second.repository.snapshot().conversation.activeRunId).toBeNull()
    expect(() => second.repository.restorePortable(archive, at)).toThrow('chat_restore_not_empty')
    first.database.close()
    second.database.close()
  })
  it('keeps unresolved object writes in the deletion manifest and cleans ready evidence in bounded batches', () => {
    const { repository, database } = local()
    repository.admit(admission)
    repository.registerObject('pending', rid, 'chat/pending')
    repository.registerObject('ready', rid, 'chat/ready')
    repository.readyObject('ready')
    expect(repository.cleanupKeys(Date.now())).toEqual(['chat/ready'])
    repository.forgetObjects(['chat/ready'])
    expect(repository.hasObjects()).toBe(true)
    expect(repository.cleanupKeys(Date.now() + 600_001)).toEqual(['chat/pending'])
    repository.forgetObjects(['chat/pending'])
    expect(repository.hasObjects()).toBe(false)
    database.close()
  })
  it('rolls back every admission row if part of the transaction fails', () => {
    const { repository, database } = local()
    database.exec(
      "CREATE TRIGGER reject_assistant BEFORE INSERT ON chat_messages WHEN NEW.id='assistant-1' BEGIN SELECT RAISE(ABORT,'synthetic');END",
    )
    expect(() => repository.admit(admission)).toThrow('synthetic')
    expect(repository.run(rid)).toBeNull()
    expect(repository.events(0)).toEqual([])
    expect(() => repository.metadata()).toThrow('chat_not_found')
    database.close()
  })
})
function ledger() {
  const database = new DatabaseSync(':memory:')
  applyTestMigrations(database)
  const client = new SqliteTestClient(database)
  database.exec(
    `INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at) VALUES('connection','hardcover','Synthetic','connected','complete','${at}','${at}')`,
  )
  return { database, client, media: new SqlChatMedia(client), index: new SqlChatIndex(client) }
}
function item(
  database: DatabaseSync,
  id: string,
  date: string | null,
  precision: string | null = 'day',
  rating = 4,
) {
  database
    .prepare('INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run(id, 'book', `Book ${id}`, at, at)
  database
    .prepare(
      "INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,rating_value,rating_scale_minimum,rating_scale_maximum,upstream_state,created_at,updated_at) VALUES(?,?,'connection',?,'hardcover_finished_read',?,?,?, ?,0.5,5,'active',?,?)",
    )
    .run(`archive-${id}`, id, id, date, precision, date ? 'source_asserted' : null, rating, at, at)
}
const query = {
  scope: 'archive' as const,
  output: 'both' as const,
  filters: {},
  statistics: {
    measures: ['distinct_items', 'consumption_occurrences'] as (
      'distinct_items' | 'consumption_occurrences'
    )[],
  },
  sort: 'consumed_desc' as const,
  limit: 2,
}
describe('complete Library queries and bounded credit admission', () => {
  it('counts the full population before pagination, including lexical search and 4-star ratings', async () => {
    const { database, media } = ledger()
    for (let i = 0; i < 42; i++) item(database, String(i), '2026-10-01')
    const result = await media.query({ ...query, filters: { query: 'Book', minimumRating: 4 } })
    expect(result.items).toHaveLength(2)
    expect(result.statistics?.measures.distinct_items).toBe(42)
    expect(result.more).toBe(true)
    expect(result.stable).toBe(true)
    database.close()
  })
  it('uses New York calendar boundaries through DST and preserves partial/unknown date uncertainty', async () => {
    const { database, media } = ledger()
    item(database, 'start', '2026-03-08T05:00:00.000Z', 'instant')
    item(database, 'end', '2026-03-09T04:00:00.000Z', 'instant')
    item(database, 'partial', '2026-03', 'month')
    item(database, 'unknown', null, null)
    expect(chatCalendarInstant('2026-03-08', 'America/New_York')).toBe('2026-03-08T05:00:00.000Z')
    expect(chatCalendarInstant('2026-03-09', 'America/New_York')).toBe('2026-03-09T04:00:00.000Z')
    const result = await media.query({
      ...query,
      filters: {
        consumed: { from: '2026-03-08', toExclusive: '2026-03-09', timezone: 'America/New_York' },
      },
      statistics: { ...query.statistics, groupBy: 'month' },
    })
    expect(result.statistics?.measures.distinct_items).toBe(1)
    expect(result.coverage.uncertainDateOccurrences).toBe(1)
    expect(result.coverage.undatedOccurrences).toBe(1)
    expect(result.statistics?.groups[0]?.label).toBe('2026-03')
    database.close()
  })
  it('reads only the latest ready article manifest for the exact retained source version', async () => {
    const { database, media } = ledger()
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at) VALUES('reader','readwise','Synthetic Reader','connected','complete','${at}','${at}');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at) VALUES('reader-run','reader','backfill','succeeded','${at}','${at}');
      INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status) VALUES('reader-raw','reader','reader-run','api_page','page','synthetic/page.json','${'a'.repeat(64)}','application/json',2,'${at}','processed');
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,observed_at,parser_version,disposition,upstream_state) VALUES('reader-record','reader-raw','reader','reader_document','$.results[0]','reader-document','${at}','synthetic@1','normalized','active');
      INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES('article','article','Retained article','${at}','${at}');
      INSERT INTO readwise_documents(id,connection_id,document_id,media_item_id,raw_category,current_location,upstream_state,reading_time_parser_version,progress_valid,updated_at_source,last_source_record_id,last_observed_at,projection_version) VALUES('document','reader','document','article','article','archive','active',1,0,'${at}','reader-record','${at}',1);
    `)
    for (const [id, version, date] of [
      ['manifest-1', 1, '2026-10-30T12:00:00Z'],
      ['manifest-2', 2, '2026-10-30T12:01:00Z'],
    ] as const) {
      database
        .prepare(
          "INSERT INTO article_content_manifests(id,readwise_document_id,media_item_id,content_kind,raw_object_key,raw_sha256,extracted_object_key,extracted_sha256,source_updated_at,extraction_version,state,coverage,acquired_at,policy_version) VALUES(?,'document','article','reader_html','synthetic/raw','hash','synthetic/text','hash',?,?,'ready','full',?,1)",
        )
        .run(id, at, version, date)
      database.prepare("INSERT INTO article_content_chunks VALUES(?,0,0,12,'hash')").run(id)
      const inserted = database
        .prepare(
          'INSERT INTO article_content_search_map(manifest_id,chunk_ordinal) VALUES(?,0) RETURNING rowid',
        )
        .get(id) as { rowid: number }
      database
        .prepare(
          "INSERT INTO article_content_search(rowid,manifest_id,chunk_ordinal,content) VALUES(?,?,0,'retained orchard source')",
        )
        .run(inserted.rowid, id)
    }
    expect((await media.articlePassages('article', 'orchard')).map((x) => x.manifest_id)).toEqual([
      'manifest-2',
    ])
    const before = await media.revision()
    database.exec(
      "UPDATE readwise_documents SET updated_at_source='2026-10-31T12:00:00Z' WHERE id='document'",
    )
    expect(await media.revision()).not.toBe(before)
    expect(await media.articlePassages('article')).toEqual([])
    database.close()
  })
  it('reserves concurrent requests atomically and never authorizes a repeated or overspent reservation', async () => {
    const { database, index } = ledger()
    const request = { id: 'a', period: 'test', runId: 'run', amount: 7, limit: 10, at }
    expect(await index.reserve(request)).toBe(true)
    expect(await index.reserve(request)).toBe(false)
    expect(await index.reserve({ ...request, id: 'b' })).toBe(false)
    expect(await index.spent('test')).toBe(7)
    await index.settle('a', 2)
    expect(await index.reserve({ ...request, id: 'b' })).toBe(true)
    expect(await index.spent('test')).toBe(9)
    expect(await index.acquireRun('r1', at, '2027')).toBe(true)
    expect(await index.acquireRun('r2', at, '2027')).toBe(true)
    expect(await index.acquireRun('r3', at, '2027')).toBe(false)
    await index.releaseRun('r1')
    expect(await index.acquireRun('r3', at, '2027')).toBe(true)
    database.close()
  })
  it('invalidates moving collection cursors and rejects stale/out-of-order publication after deletion', async () => {
    const { database, index } = ledger(),
      chat = local()
    chat.repository.admit(admission)
    const meta = chat.repository.metadata()
    await index.publish(meta)
    const first = await index.list({ favorite: false, limit: 1 })
    await index.publish({ ...meta, favorite: true, publicationRevision: 2 })
    await expect(
      index.list({ favorite: false, limit: 1, revision: first.revision }),
    ).rejects.toThrow('chat_cursor_stale')
    await index.publish({ ...meta, deletedAt: at, publicationRevision: 3 })
    await index.publish({ ...meta, publicationRevision: 4 })
    expect((await index.list({ favorite: false, limit: 50 })).data).toHaveLength(0)
    database.close()
    chat.database.close()
  })
})
