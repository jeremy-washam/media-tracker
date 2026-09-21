# Imladris — Product Context

This document records the durable product intent and constraints for the project.

The product name is **Imladris**. It replaces the earlier working name “Media
Tracker” and the “Margin” label used in exploratory interface studies. Existing
`media-tracker` repository, package-scope, storage, and deployment identifiers
remain compatibility identifiers until a separate infrastructure migration is
needed; they are not the product name.
See the [product naming history](naming.md) for the complete brainstorming trail
and selection rationale.

## Purpose

This is a private, personal media-and-learning application for its owner—not a product intended for marketing or sale.

The application is intentionally single-user. Do not add multi-tenant product architecture, public onboarding, team features, growth mechanics, or commercial SaaS requirements unless this direction explicitly changes.

It should turn a fragmented media life into an intentional, adaptive way to learn and explore. The goal is not a generic recommendation feed or a conventional read-it-later app.

## Initial product interface

The agreed initial interface beyond ingestion has three primary surfaces:

- **Chat:** new and ongoing AI conversations, conversation history, saved
  artifacts (including interactive visualizations and generated lists), and
  clickable media references with details for both Library and catalog items.
- **Library:** browse imported items and full details, first by media type and
  then by Archive or Queue. Priority order: Books, Movies, Articles, Podcasts,
  Songs, YouTube videos. Show one item with all supported consumption history;
  date filters match any occurrence. Initial Library is read-only. Reading,
  watching, and listening inside the app are not in scope and may never be.
- **Recaps:** browsable monthly and yearly rollups across media. The name is
  provisional; the workspace can later support general-purpose analytics.

Index is the selected desktop design foundation, with a collapsible left sidebar
and one compact contextual inspector. Connections and Settings are secondary.
Lists, Feed, and Explorations are future possibilities; Explorations may be part
of Chat. See the [desktop UI foundation](../design/ui-foundation.md) for accepted
behavior, writing preferences, open questions, and the seven layout studies.

These are product/design decisions, not claims that Chat, artifacts, Queue,
catalog integrations, or Recaps are implemented. The ingestion ledger remains
the trustworthy data foundation.

## Longer-term learning concept

The user can add a one-sentence learning intention at any time, for example:

- "How do behavior trees work?"
- "Miyazaki animation behind the scenes."

The main feed should draw high-quality, relevant material from active intentions. The user can also open an individual past topic and either:

- generate/refine a set of links to explore; or
- use AI chat to investigate the topic directly.

The system should import and retain media consumption history from existing services and make it easy to browse. The initial source systems are Readwise Reader, YouTube, Spotify, Letterboxd, and Hardcover. Songs are secondary. In-app media consumption is not a dependency.

Feeds may be generated from active intentions, a particular historical period, a selected topic, or the whole personal history.

## Product distinction

Readwise Reader is a useful reference point and an existing user tool, but it is not the desired product. Reader is principally an archive/reading surface for saved or subscribed content. This project combines a cross-media personal Library, Chat, and Recaps. A future adaptive feed may draw on explicit learning intentions and personal history.

The feed should be intentional rather than opaque. Example modes include:

- stay current on a topic;
- learn a topic from first principles;
- explore adjacent ideas;
- catch up in a specified time budget;
- prefer audio/video/articles;
- favor novelty, primary sources, depth, or diverse viewpoints.

Every feed item should eventually have an understandable reason for inclusion.

## Content acquisition: practical model

An LLM API alone is not a content source. Use it as an editor: expand a learning intention into search queries, assess/rank candidate material, remove redundancy, compose a coherent set, and explain recommendations.

Candidate content needs to come from source systems:

- Reader API/export for saved documents and highlights.
- RSS feeds for blogs and Substack publications (typically `https://publication.substack.com/feed`).
- YouTube Data API for public video discovery and metadata.
- A web-search API for relevant articles beyond subscriptions.
- Official APIs, webhooks, RSS, and user data exports for Letterboxd, Hardcover,
  Spotify, YouTube, and other services where direct history APIs are incomplete.

For public YouTube discovery, use the YouTube Data API rather than treating transcript extraction as foundational. Link to the source for playback; embedded viewing and app-level playback tracking are outside the initial scope. Public Substack material can come from RSS or public pages; paid material should only be accessed through an authorized source such as an email/newsletter connection or a user-save flow.

## First implementation milestone

Keep the first implementation focused on a trustworthy personal media ledger:

1. Define canonical media items, external identities, and Archive entries.
2. Preserve raw source records and complete sync provenance.
3. Backfill and reconcile Readwise Reader history.
4. Add Hardcover and Letterboxd history ingestion.
5. Add Spotify podcast and secondary song history ingestion.
6. Add YouTube watch-history ingestion.
7. Make sync failures, replay, export, and recovery observable and reliable.

The first question to validate is: can this become a complete, trustworthy, and
searchable record of the owner's media consumption despite gaps in upstream
service APIs?

## Current implementation priority

The first implementation phase is an ingestion-first personal media ledger. It should backfill and then continuously sync consumption history, where the source services permit it, from:

- Letterboxd for films;
- Hardcover for books;
- Spotify for podcasts and, secondarily, songs;
- Readwise Reader for articles and other saved documents; and
- YouTube for watched videos.

Use official APIs, webhooks, RSS feeds, and user data exports as appropriate. Preserve raw imports and sync provenance, and be explicit where an upstream service cannot provide complete or real-time history.

## Capabilities beyond the ingestion milestone

- A centralized queue of content to consume later. The local application should be the reliable source of truth. Mirror queue changes to upstream services such as Letterboxd's watchlist when an official, dependable integration permits it, but upstream bidirectional sync is not critical.
- LLM-assisted search over the owner's saved media, history, metadata, notes, highlights, and authorized full text. Arbitrary natural-language queries should return traceable answers grounded in stored records and source provenance rather than opaque unsupported responses.
- An iOS application. Mobile is not an initial priority, and the owner dislikes
  mobile apps, so avoid making the native client foundational. Keep the backend
  API-first, design the initial web client for desktop, and pursue mobile as a
  separate experience later only if it provides clear value.

## Technical foundation

The hardest technical problem is a trustworthy canonical personal-media ledger, not the LLM integration.

Maintain a small common model roughly like:

```text
MediaItem
  type: article | video | podcast_episode | movie | book | song
  title, creator, canonical URL/IDs, source, dates, duration
  available text/transcript/metadata, provenance

ArchiveEntry
  consumed media item, optional consumed date/precision
  source-recorded and ingested timestamps, rating/review, provenance

QueueEntry
  explicit future intent, local state, optional upstream mirror

TopicIntent
  original user sentence, status, derived concepts, linked items
```

Archive is the canonical consumption-history ledger. It does not need a
universal progress or engagement event vocabulary. Admission is source-specific:
completion-like evidence is appropriate for films, books, and eligible archived
Reader media; any positive Spotify podcast playback counts as consumed; and each
timestamped YouTube `Watched` activity with a usable video identity is
consumption evidence. Preserve richer upstream facts such as Readwise highlights,
Spotify play segments, YouTube activity cards, ratings, reviews, and rereads in
raw evidence and source-specific records. An admitted item may have an unknown
consumption date.

Preserve raw source data/provenance so sync logic can be rerun and the system can answer why an item was recommended.

Only Reader articles (including PDFs, RSS items, and newsletter-style emails),
videos, and podcasts become standalone Archive items. EPUBs, tweets, personal
notes, highlight-only documents, and other Reader categories remain preserved
source evidence without appearing in Archive.

## Feed-generation outline

1. Convert selected active intentions into several precise search/topic queries.
2. Gather candidates from the user's unread/history, RSS/source updates, YouTube, and web search.
3. Enrich candidates with topics, entities, format, duration, freshness, difficulty, and quality signals.
4. Score on intent relevance, novelty, likely personal fit, source quality, and time-budget fit; penalize repetition and already-seen content.
5. Diversify and sequence the final set so it is not ten near-identical explainers.
6. Record a concise explanation and provenance for each recommendation.
7. Use explicit feedback (more like this, too basic, already know this, less breaking news, different viewpoint) to adjust future feeds.

## Design principles

- Private, personal, and optimized for one person.
- Explicit controls over hidden engagement optimization.
- Useful even with incomplete integrations.
- Import-first and honest about data gaps.
- Store metadata, links, and authorized/available text or transcripts; do not depend on permanently mirroring proprietary media.
- Treat AI as an editor/planner over structured data, not as the database or sole source of truth.

See the [long-term product vision](./long-term-vision.md) for the exploratory
relationship among Archive, Queue, Topics, Feed, Explore, recaps, and LLM chat.
See the [desktop UI foundation](../design/ui-foundation.md) for the current
interface direction.
