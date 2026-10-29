import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from '../database'

export function applyTestMigrations(
  database: DatabaseSync,
  boundary: { before?: string; through?: string } = {},
): void {
  for (const name of readdirSync(new URL('../../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (boundary.before !== undefined && name >= boundary.before) break
    if (boundary.through !== undefined && name > boundary.through) break
    database.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'))
  }
}

export interface CapturedQuery {
  sql: string
  values: readonly DatabaseValue[]
}

class SqliteTestStatement implements DatabaseStatement {
  #values: readonly DatabaseValue[] = []

  constructor(
    private readonly native: StatementSync,
    private readonly sql: string,
    private readonly owner: SqliteTestClient,
  ) {}

  bind(...values: readonly DatabaseValue[]): DatabaseStatement {
    if (values.length > 100) throw new RangeError('D1 statements support at most 100 bindings')
    this.#values = values
    return this
  }

  private values() {
    this.owner.queries.push({ sql: this.sql, values: [...this.#values] })
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }

  execute(): void {
    this.native.run(...this.values())
  }

  async run(): Promise<DatabaseRunResult> {
    this.owner.runCalls += 1
    if (this.owner.runCalls === this.owner.failOnRunCall)
      throw new Error('synthetic statement failure')
    this.execute()
    return { success: true }
  }

  async first<Row>(): Promise<Row | null> {
    return (this.native.get(...this.values()) as Row | undefined) ?? null
  }

  async all<Row>(): Promise<DatabaseAllResult<Row>> {
    return { success: true, results: this.native.all(...this.values()) as Row[] }
  }
}

/** Synthetic tests only: transactional SQLite with D1's per-statement binding limit. */
export class SqliteTestClient implements DatabaseClient {
  batchCalls = 0
  runCalls = 0
  failOnBatchCall: number | null = null
  failOnRunCall: number | null = null
  readonly queries: CapturedQuery[] = []

  constructor(readonly database: DatabaseSync) {
    database.exec('PRAGMA foreign_keys=ON')
  }

  prepare(sql: string): DatabaseStatement {
    return new SqliteTestStatement(this.database.prepare(sql), sql, this)
  }

  async batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseRunResult[]> {
    this.batchCalls += 1
    if (this.batchCalls === this.failOnBatchCall) throw new Error('synthetic batch failure')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const statement of statements) {
        if (!(statement instanceof SqliteTestStatement))
          throw new TypeError('Batch statements must come from the SQLite test adapter')
        statement.execute()
      }
      this.database.exec('COMMIT')
      return statements.map(() => ({ success: true }))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
