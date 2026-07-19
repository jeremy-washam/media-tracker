import {
  compareLetterboxdRss,
  fetchLetterboxdRss,
  summarizeLetterboxdRss,
  type LetterboxdRssSnapshot,
} from './rss.ts'

const username = process.argv
  .slice(2)
  .find((argument) => argument !== '--' && !argument.startsWith('--'))
const pollsArgument = process.argv.find((argument) => argument.startsWith('--polls='))
const intervalArgument = process.argv.find((argument) => argument.startsWith('--interval-ms='))
const polls = Number(pollsArgument?.split('=')[1] ?? '2')
const intervalMs = Number(intervalArgument?.split('=')[1] ?? '1000')

if (username === undefined || !Number.isInteger(polls) || polls < 1 || intervalMs < 0) {
  console.error(
    'Usage: pnpm --filter @media-tracker/connector-letterboxd probe:rss -- <username> [--polls=2] [--interval-ms=1000]',
  )
  process.exitCode = 1
} else {
  const snapshots: LetterboxdRssSnapshot[] = []
  for (let index = 0; index < polls; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs))
    snapshots.push(await fetchLetterboxdRss(username))
  }

  console.log(
    JSON.stringify(
      {
        polls: snapshots.map(summarizeLetterboxdRss),
        comparisons: snapshots
          .slice(1)
          .map((snapshot, index) => compareLetterboxdRss(snapshots[index]!, snapshot)),
      },
      null,
      2,
    ),
  )
}
