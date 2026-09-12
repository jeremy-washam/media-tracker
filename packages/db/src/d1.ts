import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'

interface D1StatementLike {
  bind(...values: readonly DatabaseValue[]): D1StatementLike
  first<Row>(): Promise<Row | null>
  all<Row>(): Promise<DatabaseAllResult<Row>>
  run(): Promise<DatabaseRunResult>
}

interface D1DatabaseLike {
  prepare(query: string): D1StatementLike
  batch(statements: readonly D1StatementLike[]): Promise<readonly DatabaseRunResult[]>
}

class D1StatementAdapter implements DatabaseStatement {
  #statement: D1StatementLike

  constructor(statement: D1StatementLike) {
    this.#statement = statement
  }

  bind(...values: readonly DatabaseValue[]): DatabaseStatement {
    this.#statement = this.#statement.bind(...values)
    return this
  }

  first<Row>(): Promise<Row | null> {
    return this.#statement.first<Row>()
  }

  all<Row>(): Promise<DatabaseAllResult<Row>> {
    return this.#statement.all<Row>()
  }

  run(): Promise<DatabaseRunResult> {
    return this.#statement.run()
  }

  unwrap(): D1StatementLike {
    return this.#statement
  }
}

/** Adapts a Cloudflare D1 binding to the portable repository database port. */
export class D1DatabaseClient implements DatabaseClient {
  readonly #database: D1DatabaseLike

  constructor(database: D1DatabaseLike) {
    this.#database = database
  }

  prepare(query: string): DatabaseStatement {
    return new D1StatementAdapter(this.#database.prepare(query))
  }

  batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseRunResult[]> {
    return this.#database.batch(
      statements.map((statement) => {
        if (!(statement instanceof D1StatementAdapter)) {
          throw new TypeError('D1 batches require statements prepared by the same D1 adapter')
        }
        return statement.unwrap()
      }),
    )
  }
}
