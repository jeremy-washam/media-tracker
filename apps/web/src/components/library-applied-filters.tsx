import { AppButton as Button } from './ui-patterns'
import { X } from './icons'
import styles from './library-workspace.module.css'

type Group = { label: string; keys: string[] }

const groups: Record<string, Group[]> = {
  books: [
    { label: 'Format', keys: ['format'] },
    { label: 'Series', keys: ['series'] },
    { label: 'Genre', keys: ['genre'] },
    { label: 'Read date', keys: ['finishedMode', 'finishedFrom', 'finishedTo'] },
    { label: 'Published', keys: ['publishedMode', 'publishedFrom', 'publishedTo'] },
    { label: 'Added date', keys: ['addedMode', 'addedFrom', 'addedTo'] },
    { label: 'Rating', keys: ['ratingMode', 'minRating'] },
  ],
  movies: [
    { label: 'Watched', keys: ['watched', 'watchedFrom', 'watchedTo'] },
    { label: 'Added', keys: ['added', 'addedFrom', 'addedTo'] },
    { label: 'Release year', keys: ['releaseYearFrom', 'releaseYearTo', 'releaseYearUnknown'] },
    { label: 'Rating', keys: ['rating', 'ratingMin', 'ratingMax'] },
    { label: 'Review', keys: ['reviewed'] },
    { label: 'Archive', keys: ['archive'] },
    { label: 'Runtime', keys: ['runtime', 'runtimeUnknown'] },
  ],
  articles: [
    { label: 'Type', keys: ['type'] },
    { label: 'Author', keys: ['author'] },
    { label: 'Publication', keys: ['publication'] },
    { label: 'Published', keys: ['publishedFrom', 'publishedTo', 'publishedUnknown'] },
    { label: 'Reading time', keys: ['readingTime'] },
    { label: 'Progress', keys: ['progress'] },
    { label: 'Archived', keys: ['archivedFrom', 'archivedTo', 'archivedUnknown'] },
    { label: 'Added', keys: ['addedFrom', 'addedTo', 'addedUnknown'] },
    { label: 'Arrived', keys: ['arrivedFrom', 'arrivedTo', 'arrivedUnknown'] },
    { label: 'Current state', keys: ['currentState'] },
    { label: 'Queue state', keys: ['queueState'] },
    { label: 'Opened', keys: ['opened'] },
    { label: 'History', keys: ['history'] },
  ],
  podcasts: [
    { label: 'Following', keys: ['following'] },
    { label: 'Show', keys: ['show'] },
    { label: 'Activity date', keys: ['dateFrom', 'dateTo', 'dateUnknown'] },
    { label: 'Published', keys: ['publishedFrom', 'publishedTo', 'publishedUnknown'] },
    { label: 'Duration', keys: ['duration'] },
    { label: 'Publisher', keys: ['publisher'] },
    { label: 'Language', keys: ['language'] },
    { label: 'Library episodes', keys: ['libraryEpisodes'] },
  ],
  music: [
    { label: 'Playback date', keys: ['from', 'to'] },
    { label: 'Source', keys: ['source'] },
    { label: 'Playbacks', keys: ['minPlaybacks', 'playbackCount'] },
    { label: 'Metadata', keys: ['metadata'] },
    { label: 'Artist', keys: ['artist'] },
    { label: 'Album', keys: ['album'] },
    { label: 'Explicit', keys: ['explicit'] },
    { label: 'Album type', keys: ['albumType'] },
  ],
  videos: [
    { label: 'Account', keys: ['account'] },
    { label: 'Channel', keys: ['channel'] },
    { label: 'Watched', keys: ['watchedFrom', 'watchedTo', 'watchedUnknown'] },
    { label: 'Added', keys: ['addedFrom', 'addedTo', 'addedUnknown'] },
    { label: 'Published', keys: ['published', 'publishedFrom', 'publishedTo'] },
    { label: 'Duration', keys: ['duration', 'durationUnknown'] },
    { label: 'Watch count', keys: ['watchCount'] },
    { label: 'Overlap', keys: ['overlap'] },
    { label: 'Format', keys: ['format'] },
    { label: 'Availability', keys: ['availability'] },
    { label: 'Category', keys: ['category'] },
  ],
}

function active(value: unknown) {
  return Array.isArray(value)
    ? value.length > 0
    : value !== undefined && value !== false && value !== '' && value !== 'any' && value !== 'all'
}

/** Clear each predicate as a group, including its dependent bounds. Keep query and sort. */
export function LibraryAppliedFilters<TSearch extends object>({
  media,
  search,
  onChange,
}: {
  media: keyof typeof groups
  search: TSearch
  onChange: (patch: Partial<TSearch>) => void
}) {
  const values = search as Record<string, unknown>
  const applied = (groups[media] ?? []).filter((group) =>
    group.keys.some((key) => active(values[key])),
  )
  if (!applied.length) return null
  const clear = (selected: Group[]) =>
    onChange(
      Object.fromEntries([
        ...selected.flatMap((group) => group.keys.map((key) => [key, undefined])),
        ['item', undefined],
        ['channelItem', undefined],
        ['kind', undefined],
      ]) as Partial<TSearch>,
    )
  return (
    <div
      className={styles['applied-filters']}
      aria-label="Applied filters"
      data-ui="applied-filters"
    >
      {applied.map((group) => {
        const count = group.keys.reduce(
          (total, key) => total + (Array.isArray(values[key]) ? values[key].length : 0),
          0,
        )
        return (
          <Button
            key={group.label}
            size="xs"
            variant="secondary"
            aria-label={`Remove ${group.label} filter`}
            onClick={() => clear([group])}
          >
            {group.label}
            {count > 0 ? ` (${count})` : ''}
            <X aria-hidden="true" />
          </Button>
        )
      })}
      <Button size="xs" variant="ghost" onClick={() => clear(applied)}>
        Clear all filters
      </Button>
    </div>
  )
}
