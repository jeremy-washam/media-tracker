# Chat UI review

- Status: Familiar selected; all three synthetic studies retained for reference
- Prepared: October 30, 2026

Open [the comparison](http://127.0.0.1:5176/chat-review.html) after starting the
Vite-only preview below. The controls above the app switch versions, appearance,
and response scenarios. Every chat, highlight, tool event, and response is
synthetic; no model, library API, or source service is called.

```sh
pnpm --filter @media-tracker/web exec vite --host 127.0.0.1 --port 5176 --strictPort
```

## Three versions

| Version                                                                 | Composition                                                                              | Activity treatment                                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [01 · Familiar](http://127.0.0.1:5176/chat-review.html?variant=classic) | One sidebar with chat history below application navigation; generous conversation column | Quiet inline Thinking summary and expandable tool calls                   |
| [02 · Compact](http://127.0.0.1:5176/chat-review.html?variant=compact)  | The same sidebar, with denser chat history and conversation spacing                      | Framed inline activity block with a compact answer                        |
| [03 · Focus](http://127.0.0.1:5176/chat-review.html?variant=activity)   | The same sidebar, with a separate activity margin beside the conversation                | Research trail remains beside the answer; returns inline at narrow widths |

All three retain the approved Graphite light/dark theme, Balanced type roles,
J2 Imladris mark, Phosphor icons, and installed shadcn/Base UI controls. These
variations explore structure and density rather than alternative branding.

## Shared behavior

The owner rejected the first studies' shared section headings, New Chat action,
and composer styling. The revised studies use plain muted section labels with
trailing chevrons and no counts, an unbordered New Chat row with a compose icon,
and one rounded multiline field with an inset circular Send/Stop button. The
empty disabled Send button no longer fades the entire input. These shared
compositions live in `review-controls.tsx`; the production component defaults
and the three layout alternatives remain separate from this visual review.

Further review placed chat navigation underneath Chat/Library/Recaps within the
existing sidebar. Row actions use small star and ellipsis glyphs directly on the
row, without a separate dark action capsule. The slogan, subtitle and visible
keyboard hint have been removed. Empty-state copy will use a rotating Tolkien
excerpt from a separately reviewable display set.
See the [100 quote candidates](tolkien-quote-candidates.md). The enabled short
excerpts in `tolkien-quotes.ts` are selected locally on page load and on each
New Chat; the previous excerpt is excluded when another enabled choice exists.
The review-only candidates are not silently treated as available quote text.

The chat sidebar starts with New Chat, followed by independently collapsible
Favorites and Chats. Favorites have no cap and never also appear in Chats.
Both sections sort by latest activity; section collapse is remembered locally.
Hovering or keyboard-focusing a row reveals the star and more menu. The menu
contains only Rename, Favorite/Unfavorite, and Delete. Rename and Delete open a
modal Sheet; deletion operates only on the temporary synthetic collection.

The composer expands with multiline text, sends with Enter, inserts a newline
with Shift+Enter, and preserves IME composition. Its only action is Send,
which becomes Stop while the simulated response runs. A sent prompt advances
through Thinking, tool calls, and a synthetic answer. Stop halts at the current execution stage without inventing future tool results.
The held Stopped scenario illustrates an answer interrupted after partial text. Scenario buttons let reviewers hold any
state without waiting. There are no message action toolbars, attachments, model
selectors, microphone actions, or custom-action buttons.

Thinking content represents a provider-supplied summary, not raw internal
reasoning. Tool activity represents three explicit synthetic executions:
querying library items, fetching selected evidence, and web search. These are
presentation samples, not promises of exact provider wording or event cadence.
A real implementation must populate this view from normalized execution events
and show summaries only when a provider supplies them.

Inline library citations open one compact illustrative item inspector. The
"Many favorites" review control adds 32 favorites to demonstrate overflow with
no cap. It is outside the app interface. Theme and section state are isolated
from production app preference keys. Narrow navigation uses the installed modal
Sheet; global Library, Recaps, and Connections controls remain available there
but explain that those screens are outside this study.

## Source and boundaries

- Entry: `apps/web/chat-review.html`
- React study: `apps/web/src/chat-review/`
- Standard menu primitive: `apps/web/src/components/ui/dropdown-menu.tsx`
- Local Vite builds include this entry; deployment mode still builds only the production app.

Production routes, app-shell behavior, library queries, and backend contracts
are unchanged. Review and select a direction before integrating a production
Chat surface.

## Review verification

Headless Chromium exercised keyboard menu access, the exact three menu actions,
rename, favorite placement without duplication, persisted section collapse,
32 additional favorites with the final row reachable, citation inspector Escape
and opener focus return, Send/Stop before tools and during a tool call, theme
changes, and narrow navigation focus return. No page errors or application API
requests occurred.

Composer bounds were measured at 1710, 1280, 960, 700, and 390px viewport widths
with a 929px height; Send remained inside the viewport. A 390px-wide view had no
horizontal document overflow. Screenshots cover every version in light and dark
mode, an empty landing, favorites overflow, and narrow views with navigation.
