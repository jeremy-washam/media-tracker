import { describe, expect, it, vi } from 'vitest'
import { D1DatabaseClient } from './d1'

function setup() {
  const statement = {
    bind: vi.fn(function () {
      return statement
    }),
    async first<Row>(): Promise<Row | null> {
      return null
    },
    async all<Row>() {
      return { success: true, results: [] as Row[], meta: { rows_read: 12, rows_written: 0 } }
    },
    async run() {
      return { success: true, meta: { rows_read: 3, rows_written: 8 } }
    },
  }
  const native = {
    prepare: vi.fn(() => statement),
    batch: vi.fn(async () => [
      { success: true, meta: { rows_read: 4, rows_written: 6 } },
      { success: true, meta: { rows_read: 2, rows_written: 5 } },
    ]),
  }
  const observe = vi.fn()
  const client = new D1DatabaseClient(native, observe)
  return { client, native, statement, observe }
}

describe('D1 usage observation', () => {
  it('reports native read/write metadata without SQL, values or result payloads', async () => {
    const { client, observe } = setup()
    await client.prepare('synthetic SQL').bind('private synthetic parameter').all()
    expect(observe).toHaveBeenCalledWith({
      operation: 'all',
      statementCount: 1,
      measuredStatements: 1,
      rowsRead: 12,
      rowsWritten: 0,
      elapsedMs: expect.any(Number),
      success: true,
    })
    expect(JSON.stringify(observe.mock.calls)).not.toContain('private synthetic parameter')
    expect(JSON.stringify(observe.mock.calls)).not.toContain('synthetic SQL')
    await client.prepare('synthetic').run()
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ rowsWritten: 8, rowsRead: 3 }),
    )
  })
  it('marks first() as unmeasured rather than converting it to an unbounded all()', async () => {
    const { client, statement, observe } = setup()
    const all = vi.spyOn(statement, 'all')
    await client.prepare('synthetic').first()
    expect(all).not.toHaveBeenCalled()
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'first', statementCount: 1, measuredStatements: 0 }),
    )
  })
  it('aggregates batch metadata once, including indexed write costs returned by D1', async () => {
    const { client, observe } = setup()
    await client.batch([client.prepare('one'), client.prepare('two')])
    expect(observe).toHaveBeenCalledOnce()
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'batch',
        statementCount: 2,
        measuredStatements: 2,
        rowsRead: 6,
        rowsWritten: 11,
        success: true,
      }),
    )
  })
  it('does not replace persistence errors or failures with observer errors', async () => {
    const { client, statement, observe } = setup()
    observe.mockImplementation(() => {
      throw new Error('observer')
    })
    await expect(client.prepare('ok').run()).resolves.toMatchObject({ success: true })
    const failure = new Error('database')
    vi.spyOn(statement, 'run').mockRejectedValue(failure)
    await expect(client.prepare('bad').run()).rejects.toBe(failure)
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, measuredStatements: 0 }),
    )
  })
  it('reports failed batches once without advancing any application state', async () => {
    const { client, native, observe } = setup()
    const failure = new Error('batch failure')
    native.batch.mockRejectedValue(failure)
    await expect(client.batch([client.prepare('one'), client.prepare('two')])).rejects.toBe(failure)
    expect(observe).toHaveBeenCalledOnce()
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ statementCount: 2, success: false, measuredStatements: 0 }),
    )
  })
})

describe('D1 telemetry preserves incomplete and failed native outcomes', () => {
  it.each([
    ['missing', undefined],
    ['missing writes', { rows_read: 6 }],
    ['negative reads', { rows_read: -1, rows_written: 2 }],
    ['not a number', { rows_read: Number.NaN, rows_written: 2 }],
    ['infinite writes', { rows_read: 6, rows_written: Number.POSITIVE_INFINITY }],
  ])('leaves %s metadata unmeasured without corrupting totals', async (_label, meta) => {
    const observe = vi.fn()
    const result = { success: true, ...(meta === undefined ? {} : { meta }) }
    const statement = {
      bind() {
        return this
      },
      async first<Row>(): Promise<Row | null> {
        return null
      },
      async all<Row>() {
        return { ...result, results: [] as Row[] }
      },
      async run() {
        return result
      },
    }
    const client = new D1DatabaseClient(
      {
        prepare: () => statement,
        async batch() {
          return [result]
        },
      },
      observe,
    )
    expect(await client.prepare('synthetic').run()).toBe(result)
    expect(observe).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        statementCount: 1,
        measuredStatements: 0,
        rowsRead: 0,
        rowsWritten: 0,
        success: true,
      }),
    )
  })

  it('preserves a native first rejection when its observer also throws', async () => {
    const { client, statement, observe } = setup()
    const failure = new Error('native first failure')
    vi.spyOn(statement, 'first').mockRejectedValue(failure)
    observe.mockImplementation(() => {
      throw new Error('observer failure')
    })
    await expect(client.prepare('synthetic').first()).rejects.toBe(failure)
    expect(observe).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        operation: 'first',
        statementCount: 1,
        measuredStatements: 0,
        success: false,
      }),
    )
  })

  it('preserves returned native failures and their measured work', async () => {
    const { client, statement, observe } = setup()
    const failure = { success: false, meta: { rows_read: 3, rows_written: 8 } }
    vi.spyOn(statement, 'run').mockResolvedValue(failure)
    observe.mockImplementation(() => {
      throw new Error('observer failure')
    })
    expect(await client.prepare('synthetic').run()).toBe(failure)
    expect(observe).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        operation: 'run',
        measuredStatements: 1,
        rowsRead: 3,
        rowsWritten: 8,
        success: false,
      }),
    )
  })

  it('keeps incomplete batch coverage distinct from known rows and reports native failure', async () => {
    const observe = vi.fn()
    const statement = {
      bind() {
        return this
      },
      async first<Row>(): Promise<Row | null> {
        return null
      },
      async all<Row>() {
        return { success: true, results: [] as Row[] }
      },
      async run() {
        return { success: true }
      },
    }
    const results = [
      { success: true, meta: { rows_read: 9, rows_written: 5 } },
      { success: true },
      { success: true, meta: { rows_read: Number.NaN, rows_written: 4 } },
      { success: false, meta: { rows_read: 2, rows_written: 0 } },
    ]
    const client = new D1DatabaseClient(
      {
        prepare: () => statement,
        async batch() {
          return results
        },
      },
      observe,
    )
    expect(await client.batch(results.map(() => client.prepare('synthetic')))).toBe(results)
    expect(observe).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        operation: 'batch',
        statementCount: 4,
        measuredStatements: 2,
        rowsRead: 11,
        rowsWritten: 5,
        success: false,
      }),
    )
  })
})
