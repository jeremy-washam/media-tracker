import { ConnectionsResponseSchema, HealthResponseSchema } from '@media-tracker/contracts'

import type { ConnectionsResponse, HealthResponse } from '@media-tracker/contracts'

const getJson = async (path: string, fetcher: typeof fetch): Promise<unknown> => {
  const response = await fetcher(path, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`)
  }

  return response.json()
}

export const fetchHealth = async (fetcher: typeof fetch = fetch): Promise<HealthResponse> => {
  return HealthResponseSchema.parse(await getJson('/api/health', fetcher))
}

export const fetchConnections = async (
  fetcher: typeof fetch = fetch,
): Promise<ConnectionsResponse> => {
  return ConnectionsResponseSchema.parse(await getJson('/api/connections', fetcher))
}
