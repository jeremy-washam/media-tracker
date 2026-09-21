# ADR 0013: TMDB matching for Letterboxd title collisions and series

- Status: Accepted
- Date: 2026-09-21
- Supersedes: the TMDB movie search acceptance rule in ADR 0012

## Context

The first full TMDB backfill exposed three different gaps in the conservative
movie-only matcher: distinct TMDB movies sharing an exact title and display
release year; films whose Letterboxd year is a festival or country release year
but not TMDB's displayed `release_date` year; and limited series that Letterboxd
includes in its film export but TMDB catalogs as TV. Seven additional local
identity collisions came from different URL forms for the same Letterboxd film.
These are different problems and must retain distinguishable outcomes.

The Letterboxd export supplies a film URL, title, and release year but usually no
TMDB ID. Recent RSS entries can provide an exact TMDB movie ID. Letterboxd's
public page HTML is not used for automated extraction under the source policy.

## Decision

Continue to prefer exact source TMDB movie IDs and exact IMDb IDs. For a movie
search, accept a single exact normalized title/original title and displayed year
as before. When there are multiple such candidates, allow a vote-count
tie-break only if the leader has at least 20 votes and at least 20 times the
runner-up's votes. Popularity, vote average, fuzzy title similarity, and search
rank alone are never identity evidence. Record the distinct match method,
candidate count, and matcher version; otherwise retain `ambiguous`.

If that year-filtered search has no exact candidate, perform an unfiltered movie
search. A candidate is accepted only when its detail has an exact normalized
title, original title, or alternative title **and** its actual TMDB country
release-date list includes the source year. Verify at most ten bounded first-page
search candidates, prioritizing exact titles and then the first five search
results. If more than one candidate survives, apply the same vote-count
tie-break or retain `ambiguous`. Preserve the source year in the Library rather
than replacing it with TMDB's displayed release year.

If there is no verified movie candidate, search TMDB TV using the exact title or
original title and first-air year. Store a TV ID and refreshable TV profile in
separate provider fields/tables; never represent a TV ID as a movie ID. For this
initial Library, a series logged through Letterboxd remains in the existing
Movies surface, with its TMDB URL pointing to `/tv/{id}`. This does not change
the canonical type or create an inferred watch event.

When two local movie records collide on an exact TMDB movie ID, reconcile only
the constrained Letterboxd export/RSS pair: same normalized title and source
year, one export-state record, one RSS-only record with that exact TMDB ID, one
active RSS occurrence, and no Queue relationship on the RSS-only record.
Keep the export record as the Library identity. Transfer an otherwise unique RSS
watch or retire a same-day duplicate after copying its evidence to the surviving
watch. Keep the original raw/source records and retired occurrence for replay
and audit. Unproven collisions remain ambiguous.

## Consequences

This improves coverage without declaring every search result a match. The vote
tie-break is a probability judgment, not an authoritative crosswalk; the strict
threshold and provenance make it reviewable and reversible. Some films,
seasons, and individual episodes still lack a safe exact movie or TV match and
remain unmatched. TV-specific Library design remains a separate product choice.
