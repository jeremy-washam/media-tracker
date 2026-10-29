import type {
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'

export interface CatalogLease {
  jobId: string
  token: number
  kind: 'catalog' | 'spotify'
}

export class CatalogLeaseLostError extends Error {
  constructor() {
    super('Catalog worker no longer owns its lease')
    this.name = 'CatalogLeaseLostError'
  }
}

/** Keep the ownership assertion and every covered mutation in one transaction. */
export function fenceCatalogDatabase(
  database: DatabaseClient,
  lease: CatalogLease,
): DatabaseClient {
  const unwrap = new WeakMap<DatabaseStatement, DatabaseStatement>()
  const table = lease.kind === 'catalog' ? 'catalog_refresh_jobs' : 'spotify_catalog_backfill_jobs'
  const batch = async (
    statements: readonly DatabaseStatement[],
  ): Promise<readonly DatabaseRunResult[]> => {
    try {
      const results = await database.batch([
        database
          .prepare(
            `INSERT INTO catalog_write_guards(singleton_id,lease_owned)
             VALUES(1,EXISTS(SELECT 1 FROM ${table}
               WHERE id=? AND state='running' AND attempt_count=?))`,
          )
          .bind(lease.jobId, lease.token),
        ...statements,
        database.prepare('DELETE FROM catalog_write_guards WHERE singleton_id=1'),
      ])
      if (results.length !== statements.length + 2 || results.some((result) => !result.success))
        throw new Error('Fenced catalog batch did not complete successfully')
      return results.slice(1, -1)
    } catch (error) {
      if (error instanceof Error && error.message.includes('catalog_lease_owned'))
        throw new CatalogLeaseLostError()
      throw error
    }
  }
  return {
    prepare(query: string): DatabaseStatement {
      let native = database.prepare(query)
      const requireRead = () => {
        // WITH can prefix a mutation. Ignore quoted text/comments before checking
        // its SQL keywords, so a title or error string cannot affect this guard.
        const keywords = query.replace(
          /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\//g,
          ' ',
        )
        if (
          !/^\s*(?:SELECT|WITH|EXPLAIN)\b/i.test(keywords) ||
          /\b(?:INSERT|UPDATE|DELETE)\b|\bREPLACE\s+INTO\b/i.test(keywords)
        )
          throw new TypeError('Fenced catalog mutations must use run() or batch()')
      }
      const wrapped: DatabaseStatement = {
        bind(...values: readonly DatabaseValue[]) {
          native = native.bind(...values)
          unwrap.set(wrapped, native)
          return wrapped
        },
        first: <Row>() => {
          requireRead()
          return native.first<Row>()
        },
        all: <Row>() => {
          requireRead()
          return native.all<Row>()
        },
        async run() {
          const results = await batch([native])
          return results[0]!
        },
      }
      unwrap.set(wrapped, native)
      return wrapped
    },
    batch(statements) {
      return batch(statements.map((statement) => unwrap.get(statement) ?? statement))
    },
  }
}
