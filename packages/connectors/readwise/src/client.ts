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
  readonly location?: 'archive' | 'feed' | 'later' | 'new' | 'shortlist'
  readonly pageCursor?: string
  readonly updatedAfter?: string
  readonly withHtmlContent?: boolean
  readonly documentId?: string
  readonly limit?: number
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
  url.searchParams.set('limit', String(input.limit ?? 100))
  if (input.pageCursor !== undefined) url.searchParams.set('pageCursor', input.pageCursor)
  if (input.updatedAfter !== undefined) url.searchParams.set('updatedAfter', input.updatedAfter)
  if (input.withHtmlContent !== undefined) {
    url.searchParams.set('withHtmlContent', String(input.withHtmlContent))
  }
  if (input.documentId !== undefined) url.searchParams.set('id', input.documentId)

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

export async function fetchReadwiseHighlightPage(input: {
  token: string
  pageCursor?: string
  fetcher?: typeof fetch
}): Promise<RawReaderPage> {
  const url = new URL('https://readwise.io/api/v2/export/')
  url.searchParams.set('page_size', '100')
  url.searchParams.set('includeDeleted', 'true')
  if (input.pageCursor !== undefined) url.searchParams.set('pageCursor', input.pageCursor)
  const response = await (input.fetcher ?? fetch)(url, {
    headers: { accept: 'application/json', authorization: `Token ${input.token}` },
  })
  if (!response.ok) throw new ReadwiseApiError(response.status, response.headers.get('retry-after'))
  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    body: new TextDecoder().decode(bytes),
    bytes,
    contentType: response.headers.get('content-type') ?? 'application/json',
  }
}
