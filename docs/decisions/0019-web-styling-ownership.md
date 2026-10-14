# ADR 0019: Web styling ownership

- Status: Accepted
- Date: 2026-10-13

## Context

The production client combined Tailwind/shadcn controls with a large global
application stylesheet. Shared layouts, media-specific rules, scaffold styles,
and successive polish overrides lived together. Some classes also drove initial
focus and scroll behavior, while tests depended extensively on presentational
selectors. Moving files alone would leave ownership and cascade conflicts intact.

## Decision

Keep shadcn/ui Base UI primitives and Tailwind. Shared component compositions and
supported variants own standard control appearance. Use ordinary CSS Modules
for substantial application layout and custom media/content presentation, with
shared owners for shell, Library geometry, inspectors, and common media patterns.
Use utilities for small arrangements.

Keep theme tokens, shared metrics, document/accessibility defaults, and registered
custom properties global. Keep the shadcn stylesheet target and production
Tailwind import. Do not add Sass, per-module Tailwind imports, `@apply` directives,
or permanent global aliases for former application classes.

Use refs and accessible names for behavior. Preserve explicit collection/state
attributes and use a narrow structural `data-ui` contract for shared layout parts,
including portal boundaries and geometry tests. Keep Base UI data slots separate.

Consolidate effective declarations before deleting superseded styling. Retain
explicit production module import order and unlayered application rules where
required for current appearance; layer changes require independent visual
verification. Historical studies and unrouted History styling remain isolated.

## Consequences

Component and feature styling has clear ownership while global tokens still
support light/dark appearance. Shared geometry preserves contained scrolling,
header alignment, inspector motion, and exact collection anchors.

CSS Modules scope names but do not solve cascade precedence or repeated visual
values automatically. Cross-component structural selectors remain explicit
contracts; changes to them require corresponding consumers/tests to be updated.
Validation includes browser geometry/interaction assertions and visual comparison
at desktop/narrow widths in both themes, plus repository checks and web builds.

See the [implementation record](../planning/web-styling-cleanup.md).
