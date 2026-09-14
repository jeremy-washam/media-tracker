# ADR 0010: Snapshot Reconciliation and Import Recovery

- Status: Accepted
- Date: 2026-09-14
- Refines ADR 0009's occurrence reconciliation rules; retains its evidence model.

## Context

The correctness review found that replaying identical successful imports was
covered, but failed imports, overlapping snapshots, edits, and token rotation
were not. The owner requested fixes before further UI work. Synthetic examples
demonstrated duplicate occurrences, lost retry opportunities, and incorrect
current projections. No new private provider probes were required.

## Decision

- An acquired raw object is not proof of successful processing. Letterboxd skips
  an identical upload only when the current parser processed it successfully.
  Failed imports reuse the original raw manifest and retry normalization.
- Letterboxd RSS and exports share film and Diary identities in either order.
  Matching by an unambiguous exact film title/year and RSS viewing date is an
  explicit fallback, never fuzzy matching. Stable RSS keys and Diary identities
  take precedence over mutable watched dates.
- Within one YouTube account, overlapping snapshots match video ID, normalized
  UTC timestamp, and the occurrence's rank among matching cards in that snapshot.
  Thus the ledger retains the maximum observed multiplicity for that tuple;
  repeated cards within one snapshot remain distinct, and account lineages never
  merge. Existing legacy occurrence IDs are reused when found.
- The YouTube rule is a reconciliation policy, not an upstream uniqueness
  guarantee. If two snapshots each contain different, otherwise indistinguishable
  same-timestamp events, their individual identities cannot be recovered from
  the available data. Keep every raw card and source record so the projection
  can be revised. Changed timestamps remain distinct; absence is not deletion.
- A later Spotify import cannot move the latest positive playback timestamp
  backward. Full rating/review snapshots can explicitly clear current fields;
  partial observations continue to preserve fields they do not establish.
- Hardcover finished child reads retain their own edition identity. A finished
  child observation supersedes an undated Read-status fallback: the fallback is
  marked removed from the active projection with a removal-evidence link, while
  its original admission is retained. This does not claim an upstream deletion.
- Successful API response bytes are stored before parsing and schema validation.
  Malformed pages remain observable failed raw evidence.
- Rotating Spotify tokens are encrypted with AES-GCM in D1, with connection ID
  as authenticated data and a fresh IV per write. A short database lease prevents
  simultaneous refreshes. Save the returned grant before requesting library data.
  Changing the configured bootstrap token starts a new authorization. Encryption
  key changes require a new bootstrap authorization in this initial version.

## Consequences

Parser versions are advanced when normalization semantics change. Reuploading
an existing YouTube or Letterboxd ZIP can add corrected parser evidence without
replacing original records. Existing evidence is never deleted by these fixes.

History and sync activity use server-side keyset pagination. Counts apply to the
whole active Archive, independently of the current page. Unknown consumption
dates sort last. Refresh pagination after writes; this is a live collection,
not a frozen snapshot across requests.

Import chunks remain separately observable successful units. Overall completion
is tracked by the raw object's processing state and durable cursor and displayed
on Connections. Closing the browser pauses HTTP-driven imports; the user can
resume from persisted evidence. Generalized queue processing and CLI recovery
remain deferred.
