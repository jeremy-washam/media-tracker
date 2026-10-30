import type { ChatConversation } from '@media-tracker/domain'
import type { DatabaseClient } from './database'
import { ChatConflict } from './chat-conversation'

export class SqlChatIndex {
  constructor(private readonly database: DatabaseClient) {}
  async publish(meta: ChatConversation) {
    await this.database
      .prepare(
        `INSERT INTO chat_conversation_index(id,title,favorite,activity_at,publication_revision,deleted_at,body) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET title=excluded.title,favorite=excluded.favorite,activity_at=excluded.activity_at,publication_revision=excluded.publication_revision,deleted_at=excluded.deleted_at,body=excluded.body
   WHERE excluded.publication_revision>chat_conversation_index.publication_revision AND chat_conversation_index.deleted_at IS NULL`,
      )
      .bind(
        meta.id,
        meta.title,
        meta.favorite ? 1 : 0,
        meta.lastActivityAt,
        meta.publicationRevision,
        meta.deletedAt,
        JSON.stringify(meta),
      )
      .run()
  }
  async revision() {
    const row = await this.database
      .prepare(
        'SELECT COUNT(*) n,COALESCE(SUM(publication_revision),0) revision FROM chat_conversation_index',
      )
      .first<{ n: number; revision: number }>()
    return `${row?.n ?? 0}:${row?.revision ?? 0}`
  }
  async list(input: {
    favorite: boolean
    limit: number
    anchor?: { at: string; id: string }
    revision?: string
  }) {
    const revision = await this.revision()
    if (input.revision !== undefined && input.revision !== revision)
      throw new ChatConflict('chat_cursor_stale')
    const anchor = input.anchor
    const rows = await this.database
      .prepare(
        `SELECT body FROM chat_conversation_index WHERE deleted_at IS NULL AND favorite=? ${anchor ? 'AND (activity_at<? OR (activity_at=? AND id<?))' : ''} ORDER BY activity_at DESC,id DESC LIMIT ?`,
      )
      .bind(
        input.favorite ? 1 : 0,
        ...(anchor ? [anchor.at, anchor.at, anchor.id] : []),
        input.limit + 1,
      )
      .all<{ body: string }>()
    if ((await this.revision()) !== revision) throw new ChatConflict('chat_cursor_stale')
    const records = rows.results.map((row) => JSON.parse(row.body) as ChatConversation),
      data = records.slice(0, input.limit),
      last = data.at(-1)
    return {
      data,
      revision,
      next: records.length > input.limit && last ? { at: last.lastActivityAt, id: last.id } : null,
    }
  }
  async reserve(input: {
    id: string
    period: string
    runId: string
    amount: number
    limit: number
    at: string
  }) {
    const row = await this.database
      .prepare(
        `INSERT INTO chat_allowance_reservations(id,period,run_id,reserved_microusd,created_at)
   SELECT ?,?,?,?,? WHERE (SELECT COALESCE(SUM(COALESCE(charged_microusd,reserved_microusd)),0) FROM chat_allowance_reservations WHERE period=?)+?<=?
   ON CONFLICT(id) DO NOTHING RETURNING id`,
      )
      .bind(
        input.id,
        input.period,
        input.runId,
        input.amount,
        input.at,
        input.period,
        input.amount,
        input.limit,
      )
      .first<{ id: string }>()
    return row !== null // Never authorize a second external submission for a repeated reservation.
  }
  async settle(id: string, amount: number) {
    await this.database
      .prepare(
        'UPDATE chat_allowance_reservations SET charged_microusd=? WHERE id=? AND charged_microusd IS NULL',
      )
      .bind(Math.max(0, Math.ceil(amount)), id)
      .run()
  }
  async acquireRun(id: string, at: string, expires: string) {
    return (
      (await this.database
        .prepare(
          'INSERT INTO chat_run_leases SELECT ?,? WHERE (SELECT COUNT(*) FROM chat_run_leases WHERE expires_at>?)<2 ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at RETURNING id',
        )
        .bind(id, expires, at)
        .first<{ id: string }>()) !== null
    )
  }
  async releaseRun(id: string) {
    await this.database.prepare('DELETE FROM chat_run_leases WHERE id=?').bind(id).run()
  }
  async spent(period: string) {
    return (
      (
        await this.database
          .prepare(
            'SELECT COALESCE(SUM(COALESCE(charged_microusd,reserved_microusd)),0) amount FROM chat_allowance_reservations WHERE period=?',
          )
          .bind(period)
          .first<{ amount: number }>()
      )?.amount ?? 0
    )
  }
}
