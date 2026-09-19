# Web

The desktop React/Vite client consumes the REST API and contains no provider
credentials. History uses server-side type filters, complete counts, and cursor
pagination. Connections displays every account lineage, coverage, attempts,
incomplete-import progress, and resumable Spotify/YouTube imports. Use an
existing YouTube card for later snapshots of the same account.

During local development Vite serves `http://127.0.0.1:5173` and proxies `/api`
to the local Worker at `http://127.0.0.1:8787`. Import chunks are driven by the
browser; reopening Connections offers Resume import if a previous run stopped.

## Design studies

With `pnpm dev:web` running, open `http://127.0.0.1:5173/design.html`.
The separate preview entry offers seven structural studies of Chat, Library,
and Recaps: Index, Top nav, Two-pane, Journal, Gallery, Research, and Documents. All content and model responses are illustrative and state
is temporary. It makes no requests to the application API. See
`docs/design/ui-foundation.md` for scope and interaction details.

Index is the selected base. Preserve all seven studies as references. Reopening
instructions and source locations are in [saved mockups](../../docs/design/mockups.md).

## Shared components

Use shadcn/ui with Base UI (`base-nova`) for new interface work. Tailwind v4
and the `@/*` alias are configured in Vite and TypeScript. Components are owned
source in `src/components/ui`, with the class-name helper in `src/lib/utils.ts`.
Button, Input, and Textarea are installed as a minimal starting set.

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

<Input aria-label="Search library" placeholder="Search" />
<Button variant="outline">Filters</Button>
```

Add components from the repository root:

```sh
pnpm dlx shadcn@latest add dialog -c apps/web
```

`components.json` targets the shared library, not the separate theme specimen.
Use the Base UI `render` composition API rather than Radix `asChild`. Generated
code may need formatting and non-component exports moved into adjacent files to
satisfy the repository's Fast Refresh lint rule (see `button-variants.ts`).
The CLI currently imports the `cn` package directly; normalize generated imports
to `@/lib/utils`, our existing `clsx`/`tailwind-merge` helper, and remove the
redundant dependency if the CLI adds it.

`src/components.css` contains provisional neutral light/dark semantic tokens
and animation utilities. It is imported by the operational `src/styles.css`,
which already loads Tailwind. Apply `.dark` to a containing element for dark
component tokens. No theme switcher or existing screen migration is included.
Future entries should import Tailwind and this stylesheet once; the theme
specimen keeps its own styles while exploration is ongoing. Update the shared
tokens after selecting a theme rather than hardcoding colors in components.
