import { resolve } from 'node:path'

import { inspectYoutubeTakeoutFiles } from './takeout.ts'

const paths = process.argv.slice(2).filter((argument) => argument !== '--')

if (paths.length === 0) {
  console.error(
    'Usage: pnpm --filter @media-tracker/connector-youtube probe:takeout -- <takeout.zip> [more.zip...]',
  )
  process.exitCode = 1
} else {
  try {
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd()
    console.log(
      JSON.stringify(
        await inspectYoutubeTakeoutFiles(paths.map((path) => resolve(invocationDirectory, path))),
        null,
        2,
      ),
    )
  } catch {
    console.error('YouTube Takeout probe failed; verify the archive paths and file shape')
    process.exitCode = 1
  }
}
