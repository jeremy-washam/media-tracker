# Spotify connector

Status: Extended Streaming History parsing and saved-episode reconciliation are
implemented. The private history export and saved-episode API were both probed
before the ingestion rules were frozen.

This package owns Extended Streaming History parsing, saved-episode polling,
token refresh, and source-specific normalization. Untouched saved episodes are
reported as Queue candidates; any positive playback position or `fully_played`
signal maps to Archive. Songs and audiobooks remain preserved in the raw export
but are not admitted to Archive until the owner approves separate rules. See
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

The application ingestion path preserves every fetched API page in R2 before
normalization and writes a cursor only after a complete saved-episode scan.
Spotify has no podcast listening-history endpoint or listener webhook, so this
poll is best-effort: it sees current saved episodes and their mutable playback
positions, not every newly played episode.

### Observed private result

The latest complete scan authenticated successfully and returned 111 saved rows:

- 32 had a positive playback signal and map to Archive;
- 41 had an explicit zero position and map to Queue;
- 38 had null or unavailable playback evidence and remain
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

The application importer accepts the original ZIP, stores it content-addressed
in private R2, and retains every podcast playback segment as a source record.
Any positive segment with a usable Spotify episode URI admits exactly one
Archive occurrence for that episode, dated to its latest positive segment.
It creates a compact derived podcast manifest and commits at most 100 segments
per request, allowing interrupted imports to resume without repeatedly inflating
the full export. Re-importing completed ZIP bytes is a no-op. The importer
deliberately keeps same-second and byte-identical rows distinct by member name
and array index.

## Persistent sync credentials

The Worker refreshes a short-lived access token for each reconciliation. It
requires `SPOTIFY_CLIENT_ID`, `SPOTIFY_REFRESH_TOKEN`, and `TOKEN_ENCRYPTION_KEY`
(base64-encoded 32-byte AES key); confidential clients
may also set `SPOTIFY_CLIENT_SECRET`. These values belong in local/deployment
secret storage and must never be committed, logged, or stored as raw evidence.
The existing PKCE probe can create the initial grant. Spotify refresh tokens
expire after six months, so the connection eventually requires reauthorization.

Migration 0002 stores rotating refresh tokens encrypted in D1, bound to the
connection with AES-GCM authenticated data. A database lease serializes refreshes;
the replacement is persisted before fetching saved episodes, including when a
later page fails. Replacing the bootstrap secret with a new authorization resets
the stored grant. The encryption key must be backed up privately. Do not change
it without also obtaining a new bootstrap authorization.

Playback dates are monotonic across export imports: an older snapshot can add
evidence but cannot replace a later positive playback date. Successful API
responses are stored before JSON/schema validation, so malformed pages remain
available as failed raw evidence.
