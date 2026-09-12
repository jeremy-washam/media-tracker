export type DatabaseValue = ArrayBuffer | null | number | string

export interface DatabaseRunResult {
  readonly success: boolean
}

export interface DatabaseAllResult<Row> extends DatabaseRunResult {
  readonly results: readonly Row[]
}

export interface DatabaseStatement {
  bind(...values: readonly DatabaseValue[]): DatabaseStatement
  first<Row>(): Promise<Row | null>
  all<Row>(): Promise<DatabaseAllResult<Row>>
  run(): Promise<DatabaseRunResult>
}

/**
 * The subset of the D1 API repositories need. A structural port keeps D1 types
 * out of connectors and allows the same repositories to run against local
 * SQLite adapters in tests and recovery tools.
 */
export interface DatabaseClient {
  prepare(query: string): DatabaseStatement
  batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseRunResult[]>
}
