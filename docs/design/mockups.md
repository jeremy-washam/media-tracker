# Interface mockups

- Saved: 2026-09-19
- Selected base: **Index**
- Scope: interactive design references, separate from the operational client

## Reopen

From the repository root, run:

```sh
pnpm dev:web
```

Open <http://127.0.0.1:5173/design.html?direction=index>. Use the top switch to
compare layouts and the app navigation to switch Chat, Library, and Recaps.
The server can be stopped and restarted without losing the saved designs.

| Layout    | Local preview                                                | Distinction                                        |
| --------- | ------------------------------------------------------------ | -------------------------------------------------- |
| Index     | [Open](http://127.0.0.1:5173/design.html?direction=index)    | Selected sidebar workspace with optional inspector |
| Top nav   | [Open](http://127.0.0.1:5173/design.html?direction=top)      | Horizontal global and media navigation             |
| Two-pane  | [Open](http://127.0.0.1:5173/design.html?direction=browser)  | Selection list with persistent details             |
| Journal   | [Open](http://127.0.0.1:5173/design.html?direction=journal)  | Date-oriented collection and recaps                |
| Gallery   | [Open](http://127.0.0.1:5173/design.html?direction=shelves)  | Horizontal shelves and overlay inspection          |
| Research  | [Open](http://127.0.0.1:5173/design.html?direction=tabs)     | Workspace tabs and optional Library reference pane |
| Documents | [Open](http://127.0.0.1:5173/design.html?direction=document) | Document titles, page navigation, and outline      |

The former Folio and Gallery theme-only variations were intentionally removed.
The current Gallery is a structural shelf study. Preserve the seven current
studies as references while refining Index unless the owner requests otherwise.

## Saved source

- [HTML entry](../../apps/web/design.html)
- [React entry](../../apps/web/src/design/main.tsx)
- [Layouts and interactions](../../apps/web/src/design/app.tsx)
- [Shared and layout-specific styles](../../apps/web/src/design/styles.css)
- [Synthetic sample data](../../apps/web/src/design/data.ts)
- [Vite configuration](../../apps/web/vite.config.ts), including the separate
  design entry in builds

`pnpm --filter @media-tracker/web build` also produces `apps/web/dist/design.html`
and its bundled assets. The source files above are the durable originals;
`dist` is generated output.

## What is and is not saved

All seven layouts, the sample collection, sample conversations, artifact views,
and monthly/yearly recap compositions are saved in source. The comparison can
be reopened without connecting any personal services.

Runtime selections, filters, draft messages, artifact renames, and other changes
made while exploring are ephemeral. No live LLM, API-backed Library, artifact
storage, or real analytics are connected. Histories and recap statistics are
illustrative; cover artwork is composed in CSS. Fonts load from Google Fonts
with local fallbacks. The studies use the accepted Imladris product name.

The chosen sidebar collapse behavior is documented next work; it is not yet
implemented in the saved Index study. See the
[UI foundation](ui-foundation.md) for accepted decisions and unresolved details.
