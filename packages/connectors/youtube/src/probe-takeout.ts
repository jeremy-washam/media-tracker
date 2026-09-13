import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { resolve } from 'node:path'

import { inspectYoutubeTakeoutBytes, summarizeYoutubeTakeouts } from './takeout.ts'

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
        summarizeYoutubeTakeouts(
          await Promise.all(
            paths.map(async (path) => {
              const absolutePath = resolve(invocationDirectory, path)
              return inspectYoutubeTakeoutBytes(
                await readFile(absolutePath),
                basename(absolutePath),
              )
            }),
          ),
        ),
        null,
        2,
      ),
    )
  } catch {
    console.error('YouTube Takeout probe failed; verify the archive paths and file shape')
    process.exitCode = 1
  }
}
