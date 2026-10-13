import type { DatabaseUsageObserver } from '@media-tracker/db'
import type { Bindings } from './env'

export function jobUsage(env: Bindings, scope: string) {
  const started = performance.now()
  const summary = {
    statements: 0,
    measuredStatements: 0,
    rowsRead: 0,
    rowsWritten: 0,
    databaseElapsedMs: 0,
    failedOperations: 0,
  }
  const observer: DatabaseUsageObserver = (event) => {
    summary.statements += event.statementCount
    summary.measuredStatements += event.measuredStatements
    summary.rowsRead += event.rowsRead
    summary.rowsWritten += event.rowsWritten
    summary.databaseElapsedMs += event.elapsedMs
    if (!event.success) summary.failedOperations += 1
  }
  return {
    env: { ...env, DATABASE_USAGE_OBSERVER: observer },
    report() {
      try {
        console.info(
          JSON.stringify({
            level: 'info',
            event: 'job.database_usage',
            scope,
            elapsedMs: Math.round(performance.now() - started),
            ...summary,
            databaseElapsedMs: Math.round(summary.databaseElapsedMs),
            unmeasuredStatements: summary.statements - summary.measuredStatements,
          }),
        )
      } catch {
        /* Reporting cannot replace persistence results or errors. */
      }
    },
  }
}
