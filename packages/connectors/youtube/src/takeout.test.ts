import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'

import { inspectYoutubeTakeoutBytes, summarizeYoutubeTakeouts } from './takeout.ts'

const html = `<!doctype html>
<div class="outer-cell"><div class="header-cell">YouTube</div><div class="content-cell">
Watched&nbsp;<a href="https://www.youtube.com/watch?v=synthetic-video">Synthetic Video</a><br>
<a href="https://www.youtube.com/channel/synthetic-channel">Synthetic Channel</a><br>
Jan 1, 2026, 12:00:00 PM PST
</div></div>
<div class="outer-cell"><div class="content-cell">
Watched a video that has been removed<br>Jan 2, 2026, 12:00:00 PM PST
</div></div>`

const watchLater = `Video ID,Playlist Video Creation Timestamp
synthetic-video,2026-01-01T00:00:00+00:00
future-video,2026-01-02T00:00:00+00:00
`

function takeout(label: string) {
  return inspectYoutubeTakeoutBytes(
    zipSync({
      'Takeout/YouTube and YouTube Music/history/watch-history.html': strToU8(html),
      'Takeout/YouTube and YouTube Music/playlists/Watch later-videos.csv': strToU8(watchLater),
    }),
    label,
  )
}

describe('YouTube Takeout inspection', () => {
  it('parses watch occurrences, unavailable rows, and Watch Later without emitting titles', () => {
    const result = takeout('synthetic.zip')
    const summary = summarizeYoutubeTakeouts([result])

    expect(summary.takeouts[0]).toMatchObject({
      history: {
        activityCards: 2,
        watchedEntries: 2,
        watchedEntriesWithVideoId: 1,
        watchedWithoutVideoId: 1,
      },
      watchLater: { entries: 2, alreadyInHistory: 1 },
    })
    expect(JSON.stringify(summary)).not.toContain('Synthetic Video')
    expect(JSON.stringify(summary)).not.toContain('Synthetic Channel')
  })

  it('detects exact occurrence overlap across source archives', () => {
    const summary = summarizeYoutubeTakeouts([takeout('one.zip'), takeout('two.zip')])
    expect(summary.combined).toMatchObject({
      watchedEntries: 4,
      uniqueVideoIds: 1,
      videoIdsPresentInMultipleArchives: 1,
      crossTakeoutDuplicateEvents: 2,
      watchLaterEntries: 4,
      watchLaterVideoIdsPresentInMultipleArchives: 2,
      sourceArchives: 2,
    })
  })

  it('does not call duplicate rows within one archive cross-archive overlap', () => {
    const result = takeout('one.zip')
    result.watchHistory.push(...result.watchHistory)

    expect(summarizeYoutubeTakeouts([result]).combined.crossTakeoutDuplicateEvents).toBe(0)
  })
})
