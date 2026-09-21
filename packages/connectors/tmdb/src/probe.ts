import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

interface MovieSample {
  title: string
  year: string
}

interface SearchResponse {
  results?: unknown[]
  total_pages?: number
  total_results?: number
}

const token = process.env.TMDB_API_READ_TOKEN?.trim()

if (token === undefined || token.length === 0) {
  console.error(
    'TMDB_API_READ_TOKEN is not set. Add it to the ignored repository-root .env.local file and rerun this command.',
  )
  process.exitCode = 1
} else {
  try {
    const database = new DatabaseSync(await findLocalDatabase(), { readOnly: true })
    const known = database
      .prepare("select external_id from external_identities where namespace = 'tmdb' limit 1")
      .get() as { external_id?: string } | undefined
    const samples = database
      .prepare(
        `select display_title as title, release_year as year
         from movie_library_projection
         where release_year is not null
         order by latest_known_watched_on desc
         limit 5`,
      )
      .all() as unknown as MovieSample[]

    if (known?.external_id === undefined || samples.length === 0) {
      throw new Error('The local database has no TMDB identity or movie search samples')
    }

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    const configuration = await requestJson('https://api.themoviedb.org/3/configuration', headers)
    const detail = await requestJson(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(known.external_id)}?append_to_response=credits,external_ids,images,alternative_titles&include_image_language=en,null`,
      headers,
    )
    const ownerSearches = await Promise.all(
      samples.map((sample) => search(sample.title, sample.year, headers)),
    )
    const [ambiguousControl, noMatchControl] = await Promise.all([
      search('Hamlet', '1996', headers),
      search('imladris-no-match-9f39a8398dbd', '1801', headers),
    ])

    const configurationBody = asRecord(configuration.body)
    const imageConfiguration = asRecord(configurationBody.images)
    const detailBody = asRecord(detail.body)
    const credits = asRecord(detailBody.credits)
    const images = asRecord(detailBody.images)
    const alternativeTitles = asRecord(detailBody.alternative_titles)

    console.log(
      JSON.stringify(
        {
          provider: 'tmdb',
          samplePolicy: 'aggregate-only; titles and provider identifiers omitted',
          configuration: {
            status: configuration.status,
            headers: safeHeaders(configuration.headers),
            topLevelKeys: Object.keys(configurationBody).sort(),
            imageKeys: Object.keys(imageConfiguration).sort(),
            secureBaseUrlPresent: typeof imageConfiguration.secure_base_url === 'string',
            posterSizeCount: arrayLength(imageConfiguration.poster_sizes),
            backdropSizeCount: arrayLength(imageConfiguration.backdrop_sizes),
          },
          detail: {
            status: detail.status,
            headers: safeHeaders(detail.headers),
            topLevelKeys: Object.keys(detailBody).sort(),
            nullableTopLevelKeys: Object.entries(detailBody)
              .filter(([, value]) => value === null)
              .map(([key]) => key)
              .sort(),
            collectionFields: arrayLengths(detailBody),
            creditKeys: Object.keys(credits).sort(),
            castCount: arrayLength(credits.cast),
            crewCount: arrayLength(credits.crew),
            externalIdKeys: Object.keys(asRecord(detailBody.external_ids)).sort(),
            imageKeys: Object.keys(images).sort(),
            imageCounts: arrayLengths(images),
            alternativeTitleKeys: Object.keys(alternativeTitles).sort(),
            alternativeTitleCount: arrayLength(alternativeTitles.titles),
          },
          ownerSearches: ownerSearches.map(summarizeSearch),
          controls: [
            { kind: 'ambiguous', ...summarizeSearch(ambiguousControl) },
            { kind: 'no-match', ...summarizeSearch(noMatchControl) },
          ],
        },
        null,
        2,
      ),
    )
  } catch {
    console.error(
      'TMDB live probe failed. Verify the credential, network access, local migrated database, and imported movie data.',
    )
    process.exitCode = 1
  }
}

async function search(
  query: string,
  year: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: SearchResponse }> {
  const parameters = new URLSearchParams({ query, year, include_adult: 'false' })
  const response = await requestJson(
    `https://api.themoviedb.org/3/search/movie?${parameters.toString()}`,
    headers,
  )
  return { status: response.status, body: response.body as SearchResponse }
}

function summarizeSearch(searchResult: { status: number; body: SearchResponse }) {
  return {
    status: searchResult.status,
    resultCount: searchResult.body.total_results ?? searchResult.body.results?.length ?? 0,
    pageCount: searchResult.body.total_pages ?? 0,
  }
}

async function requestJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(`TMDB returned ${response.status}`)
  return { status: response.status, headers: response.headers, body }
}

async function findLocalDatabase(): Promise<string> {
  const explicit = process.env.IMLADRIS_LOCAL_DB_PATH?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit

  const directory = resolve(
    process.env.INIT_CWD ?? process.cwd(),
    'apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
  )
  const candidates = await Promise.all(
    (await readdir(directory))
      .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
      .map(async (name) => ({
        path: resolve(directory, name),
        size: (await stat(resolve(directory, name))).size,
      })),
  )
  const selected = candidates.sort((left, right) => right.size - left.size)[0]
  if (selected === undefined) throw new Error('No local D1 database found')
  return selected.path
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function arrayLengths(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .map(([key, items]) => [key, items.length]),
  )
}

function safeHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [
      'cache-control',
      'etag',
      'expires',
      'retry-after',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
    ]
      .map((name) => [name, headers.get(name)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  )
}
