# Spotify connector

Status: official reconnaissance, private saved-episode API probe, and full
Extended Streaming History inspection complete.

This package will own Extended Streaming History import, saved-episode polling,
podcast/song metadata enrichment, best-effort reconciliation, and
source-specific normalization. Untouched saved episodes map to Queue; any
positive playback position or `fully_played` signal maps to Archive. See
the [Spotify source reconnaissance](../../../docs/sources/spotify.md) for the
current capability assessment, field inventory, limitations, and probe plan.

## Private saved-episode probe

The probe uses Authorization Code with PKCE, so it requires a Spotify client ID
but no client secret.

1. Create a single-user development-mode app in the Spotify developer dashboard.
2. Add this exact redirect URI:
   `http://127.0.0.1:8787/auth/spotify/callback`
3. Add the following to the ignored repository-root `.env.local`:

   ```dotenv
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:8787/auth/spotify/callback
   ```

4. Run:

   ```sh
   pnpm --filter @media-tracker/connector-spotify probe
   ```

On first use, the command starts a loopback callback server and prints a Spotify
authorization URL. Open it in the browser, approve the two read-only scopes, and
return to the terminal. Later runs reuse and refresh the locally stored grant.
Run `pnpm --filter @media-tracker/connector-spotify reauthorize` to replace it.

The refresh and access tokens are written to
`.private/spotify-oauth.json`, which is ignored by Git and restricted to the
current OS user. The probe prints titles, show names, saved dates, playback
positions, and the Queue/Archive classification. It never prints Spotify IDs,
descriptions, authorization codes, access tokens, or refresh tokens.

This is a schema and behavior probe, not yet durable ingestion: API responses
are not written to R2 or D1.

### Observed private result

The first complete scan authenticated successfully and returned 71 saved rows:

- 13 had a positive resume position and map to Archive;
- 21 had an explicit zero position and map to Queue;
- 37 had null title, show, duration, identity, and resume position and remain
  unresolved pending the Extended Streaming History export;
- none reported `fully_played=true`.

This confirmed that the live API can violate the reference schema's required
field examples. The parser preserves unavailable rows and never equates a null
playback position with an untouched episode.

## Extended Streaming History probe

Run the aggregate-only probe against the extracted export directory:

```sh
pnpm --filter @media-tracker/connector-spotify probe:history -- \
  "exports/Spotify Extended Streaming History"
```

The private export contained 158,787 rows across 26 annual audio/video files.
Podcast history included 6,416 segments for 2,600 episode URIs; 5,921 segments
had positive playback and admit 2,443 unique episodes to Archive. It also
contained 139 audiobook segments, which remain separate pending a product rule,
and 497 exact duplicate rows, all within individual files. Duplicate rows remain
source evidence and are not silently deduplicated.

The probe reports aggregate counts, date ranges, field types/nullability, and
reason enums. It does not print titles, show names, track/episode URIs, platform
strings, countries, or sensitive row content. Tests use synthetic rows only.
