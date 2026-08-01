import { resolve } from 'node:path'

import { inspectSpotifyHistoryDirectory } from './history.ts'

const directory = process.argv.slice(2).find((argument) => argument !== '--')

if (directory === undefined) {
  console.error(
    'Usage: pnpm --filter @media-tracker/connector-spotify probe:history -- <export-directory>',
  )
  process.exitCode = 1
} else {
  try {
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd()
    console.log(
      JSON.stringify(
        await inspectSpotifyHistoryDirectory(resolve(invocationDirectory, directory)),
        null,
        2,
      ),
    )
  } catch {
    console.error('Spotify history probe failed; verify the export directory and file shape')
    process.exitCode = 1
  }
}
