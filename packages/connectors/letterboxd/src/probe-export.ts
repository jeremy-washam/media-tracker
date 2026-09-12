import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { inspectLetterboxdExportBytes } from './export.ts'

const archiveArgument = process.argv.slice(2).find((argument) => argument !== '--')
const archivePath =
  archiveArgument === undefined
    ? undefined
    : resolve(process.env.INIT_CWD ?? process.cwd(), archiveArgument)

if (archivePath === undefined) {
  console.error(
    'Usage: pnpm --filter @media-tracker/connector-letterboxd probe:export -- <export.zip>',
  )
  process.exitCode = 1
} else {
  const summary = inspectLetterboxdExportBytes(await readFile(archivePath))
  console.log(JSON.stringify(summary, null, 2))
}
