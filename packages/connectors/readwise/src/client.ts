export class ReadwiseApiError extends Error {
  readonly status: number
  readonly retryAfter: string | null

  constructor(status: number, retryAfter: string | null) {
    super(`Readwise request failed with status ${status}`)
    this.name = 'ReadwiseApiError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

export interface FetchReaderPageInput {
  readonly token: string
  readonly location?: 'archive'
  readonly pageCursor?: string
  readonly updatedAfter?: string
  readonly fetcher?: typeof fetch
}

export interface RawReaderPage {
  readonly body: string
  readonly bytes: Uint8Array
  readonly contentType: string
}

export async function fetchReaderDocumentPage(input: FetchReaderPageInput): Promise<RawReaderPage> {
  const url = new URL('https://readwise.io/api/v3/list/')
  if (input.location !== undefined) url.searchParams.set('location', input.location)
  url.searchParams.set('limit', '15')
  if (input.pageCursor !== undefined) url.searchParams.set('pageCursor', input.pageCursor)
  if (input.updatedAfter !== undefined) url.searchParams.set('updatedAfter', input.updatedAfter)

  const response = await (input.fetcher ?? fetch)(url, {
    headers: {
      accept: 'application/json',
      authorization: `Token ${input.token}`,
    },
  })
  if (!response.ok) {
    throw new ReadwiseApiError(response.status, response.headers.get('retry-after'))
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    body: new TextDecoder().decode(bytes),
    bytes,
    contentType: response.headers.get('content-type') ?? 'application/json',
  }
}

export function fetchReaderArchivePage(input: FetchReaderPageInput): Promise<RawReaderPage> {
  return fetchReaderDocumentPage({ ...input, location: 'archive' })
}
