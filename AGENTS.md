# Repository Instructions

This file is the entrypoint for coding agents working in this repository. Keep
it concise and follow its links instead of duplicating detailed documentation.

## Read before changing code

1. Read [the product context](docs/product/context.md) for the product's purpose
   and durable constraints.
2. Read [the architecture overview](docs/architecture/README.md) and
   [development standards](docs/architecture/development-standards.md) before
   making technical decisions.
3. Read [the implementation plan](docs/planning/implementation-plan.md) when
   choosing or sequencing work.
4. Consult [the ADR index](docs/decisions/README.md) before revisiting an accepted
   architectural choice.
5. Read [the desktop UI foundation](docs/design/ui-foundation.md) before changing
   interface structure or visual design.
6. Read [the long-term vision](docs/product/long-term-vision.md) before designing
   Topics, Feed, Explore, recaps, recommendations, or LLM features.
7. Read [the source-reconnaissance index](docs/sources/README.md) and the
   relevant source report before changing a connector or the canonical schema.

## Non-negotiable product boundaries

- This is a private, personal, single-user application; do not add SaaS,
  multi-tenant, public-registration, or team abstractions.
- The frontend is React with Vite, not Next.js.
- The backend is an API-first Hono service on Cloudflare Workers.
- Preserve raw source records, provenance, external identities, source date
  precision, and distinct consumed/source-recorded/ingested timestamps. Imported
  facts must remain traceable and replayable.
- Connector writes and queue processing must be idempotent. Never advance a sync
  cursor before its records are durably committed.
- Keep domain and connector logic independent of Cloudflare so storage and
  runtime migration remain practical.
- Never commit credentials, real account exports, or unsanitized fixtures.

## Repository boundaries

- `apps/web`: React/Vite browser client
- `apps/api`: Hono Worker, HTTP, cron, queue, and Cloudflare bindings
- `apps/cli`: backfill, replay, export, and recovery commands
- `packages/domain`: pure canonical models and normalization rules
- `packages/db`: schema, migrations, repositories, and storage adapters
- `packages/contracts`: shared Zod boundary contracts
- `packages/connectors/*`: source-specific integration behavior
- `packages/test-fixtures`: synthetic and sanitized test data

Do not import platform, database, HTTP, or UI libraries into `packages/domain`.
Keep route handlers thin and put source behavior in connectors and persistence in
repositories.

## Required checks

Use pnpm from the repository root. Before handing off a code or configuration
change, run:

```sh
pnpm check
```

Also run relevant build, end-to-end, and migration checks once those commands
exist. Do not claim a check passed when its package script is absent or skipped.

## Documentation maintenance

Update the owning document when behavior or a durable decision changes. Add a
new ADR to supersede an accepted decision rather than rewriting its history.
Keep package READMEs focused on package-specific setup and behavior.

## UI component contract

Use the installed **shadcn/ui Base UI components** in `apps/web/src/components/ui/` for controls and standard interaction patterns. Read `docs/design/ui-foundation.md` and `apps/web/README.md` before UI edits. A native control plus CSS that resembles shadcn is not an acceptable substitute.

- Use Button, Input/Input Group, Checkbox with FieldLabel, Select, ToggleGroup, Tabs, Tooltip, Sheet, Alert, Badge, and Skeleton as appropriate. Install missing primitives with the configured shadcn CLI; preserve existing components, use the local cn helper, and do not add a second primitive library.
- Compose the real primitives. Keep their focus, keyboard, ARIA, disabled, and popup behavior. Do not replace an entire TabsContent with a single changing panel; each trigger needs its own associated panel. Keep lazy data loading and source semantics intact.
- Component variants own appearance. Keep global CSS for app layouts, media content, and sizing constraints; remove old native-control appearance rules when migrating. Do not force custom borders, backgrounds, focus outlines, padding, or chevrons over the installed primitive.
- Application media rows/cards and inspector click-away surfaces are intentional custom interactions. Their native buttons are centralized in library-controls.tsx. Ordinary actions cannot use those exceptions. Semantic headings, fieldsets, labels, and route links remain appropriate HTML. Historical design studies are references, not production component sources.
- Verify real light/dark UI at desktop and narrow widths, with filters, popups, and inspectors open. Measure adjacent control heights and popup/toolbar bounds, test keyboard navigation and label activation, and verify modal focus/return behavior. Passing typecheck is not visual QA.
- Run pnpm check, the frontend build, and relevant Playwright coverage after final edits. Production route code has ESLint restrictions against raw controls, handcrafted tab roles, and browser title hints; do not disable those rules to ship a replacement.
