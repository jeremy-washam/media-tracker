import { fetchSavedEpisodes, SpotifyApiError } from './api.ts'
import { getSpotifyAccessToken } from './oauth.ts'
import { summarizeSavedEpisodes } from './saved-episodes.ts'

const clientId = process.env.SPOTIFY_CLIENT_ID
const redirectUri =
  process.env.SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:8787/auth/spotify/callback'
const reauthorize = process.argv.includes('--reauthorize')

if (clientId === undefined || clientId.length === 0) {
  console.error(
    'SPOTIFY_CLIENT_ID is not set. Add it to .env.local after creating the Spotify developer app.',
  )
  process.exitCode = 1
} else {
  try {
    let accessToken = await getSpotifyAccessToken({ clientId, redirectUri, reauthorize })
    let result

    try {
      result = await fetchSavedEpisodes(accessToken)
    } catch (error) {
      if (!(error instanceof SpotifyApiError) || error.status !== 401) throw error
      accessToken = await getSpotifyAccessToken({ clientId, redirectUri, forceRefresh: true })
      result = await fetchSavedEpisodes(accessToken)
    }

    console.log(JSON.stringify(summarizeSavedEpisodes(result.episodes, result.totalReported), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Spotify probe failed')
    process.exitCode = 1
  }
}
