import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'

interface D1Metadata {
  rows_read?: number
  rows_written?: number
}
type ObservedResult = DatabaseRunResult & { meta?: D1Metadata }

export interface DatabaseUsage {
  operation: 'first' | 'all' | 'run' | 'batch'
  statementCount: number
  measuredStatements: number
  rowsRead: number
  rowsWritten: number
  elapsedMs: number
  success: boolean
}
export type DatabaseUsageObserver = (usage: DatabaseUsage) => void

interface D1StatementLike {
  bind(...values: readonly DatabaseValue[]): D1StatementLike
  first<Row>(): Promise<Row | null>
  all<Row>(): Promise<DatabaseAllResult<Row> & { meta?: D1Metadata }>
  run(): Promise<ObservedResult>
}
interface D1DatabaseLike {
  prepare(query: string): D1StatementLike
  batch(statements: readonly D1StatementLike[]): Promise<readonly ObservedResult[]>
}

function publish(
  observer: DatabaseUsageObserver | undefined,
  operation: DatabaseUsage['operation'],
  started: number,
  statementCount: number,
  success: boolean,
  results: readonly ObservedResult[] = [],
) {
  if (!observer) return
  let measuredStatements = 0
  let rowsRead = 0
  let rowsWritten = 0
  for (const result of results) {
    const read = result.meta?.rows_read
    const written = result.meta?.rows_written
    if (
      typeof read === 'number' &&
      Number.isFinite(read) &&
      read >= 0 &&
      typeof written === 'number' &&
      Number.isFinite(written) &&
      written >= 0
    ) {
      measuredStatements += 1
      rowsRead += read
      rowsWritten += written
    }
  }
  // Telemetry must never change whether database work succeeds or fails.
  try {
    observer({
      operation,
      statementCount,
      measuredStatements,
      rowsRead,
      rowsWritten,
      elapsedMs: performance.now() - started,
      success,
    })
  } catch {
    /* observer failure is outside the persistence boundary */
  }
}

class D1StatementAdapter implements DatabaseStatement {
  constructor(
    private statement: D1StatementLike,
    private readonly observer?: DatabaseUsageObserver,
  ) {}

  bind(...values: readonly DatabaseValue[]): DatabaseStatement {
    this.statement = this.statement.bind(...values)
    return this
  }

  async first<Row>(): Promise<Row | null> {
    const started = performance.now()
    try {
      const result = await this.statement.first<Row>()
      // first() has no D1 metadata; do not buffer arbitrary rows or report zero cost.
      publish(this.observer, 'first', started, 1, true)
      return result
    } catch (error) {
      publish(this.observer, 'first', started, 1, false)
      throw error
    }
  }

  async all<Row>(): Promise<DatabaseAllResult<Row>> {
    const started = performance.now()
    try {
      const result = await this.statement.all<Row>()
      publish(this.observer, 'all', started, 1, result.success, [result])
      return result
    } catch (error) {
      publish(this.observer, 'all', started, 1, false)
      throw error
    }
  }

  async run(): Promise<DatabaseRunResult> {
    const started = performance.now()
    try {
      const result = await this.statement.run()
      publish(this.observer, 'run', started, 1, result.success, [result])
      return result
    } catch (error) {
      publish(this.observer, 'run', started, 1, false)
      throw error
    }
  }

  unwrap(): D1StatementLike {
    return this.statement
  }
}

/** Adapts a Cloudflare D1 binding to the portable repository database port. */
export class D1DatabaseClient implements DatabaseClient {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly observer?: DatabaseUsageObserver,
  ) {}

  prepare(query: string): DatabaseStatement {
    return new D1StatementAdapter(this.database.prepare(query), this.observer)
  }

  async batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseRunResult[]> {
    const prepared = statements.map((statement) => {
      if (!(statement instanceof D1StatementAdapter))
        throw new TypeError('D1 batches require statements prepared by the same D1 adapter')
      return statement.unwrap()
    })
    const started = performance.now()
    try {
      const results = await this.database.batch(prepared)
      publish(
        this.observer,
        'batch',
        started,
        statements.length,
        results.every((result) => result.success),
        results,
      )
      return results
    } catch (error) {
      publish(this.observer, 'batch', started, statements.length, false)
      throw error
    }
  }
}
