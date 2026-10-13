# Web UI implementation

Follow the root AGENTS.md UI component contract. Use installed shadcn/ui Base UI components for standard controls; compose them rather than reimplementing their appearance or accessibility.

Before editing, read [UI foundation](../../docs/design/ui-foundation.md) and [web workflow](README.md). Use the configured registry and local cn utility. Preserve component defaults and use supported variants; app CSS should arrange components and media content.

The native media row/card and inspector backdrop wrappers in components/library-controls.tsx are deliberate application-specific exceptions. They do not authorize raw action buttons elsewhere. Design, specimen, and library-review studies are historical references outside production routes.

Required verification: pnpm check, pnpm --filter @media-tracker/web build, and relevant pnpm test:e2e cases. Inspect light/dark desktop and narrow layouts, including keyboard focus, open popups, inspector panes, and mobile Sheet navigation.
