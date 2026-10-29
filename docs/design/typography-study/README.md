# Typography study — October 29, 2026

Open [the original comparison](preview.html) in a browser. It preserves Compact,
Balanced, and Readable with the same illustrative content, light/dark appearance,
Books list/grid, Articles, Connections, and Details/History panels. The editable
conversation fragment is [comparison.html](comparison.html); preview.html is the
standalone browser wrapper, including the preview runtime.

## Approved: original Balanced

The owner selected the original Balanced direction and approved implementation.
The overview and inspector label/value rows both remain **14px / 400**. Section
headings use **14px / 500**, in sentence case. Do not implement the later smaller
inspector experiment.

| Role                                                              | Size | Weight                       |
| ----------------------------------------------------------------- | ---- | ---------------------------- |
| Supporting metadata, counts, summaries                            | 12px | 400                          |
| Navigation, breadcrumb, controls, tabs, inspector prose and facts | 14px | 400 body; 500 labels/actions |
| Grid titles                                                       | 14px | 600                          |
| List titles                                                       | 16px | 600                          |
| Inspector title and wordmark                                      | 22px | 500                          |

The scale has four sizes (12, 14, 16, 22px) and three weights (400, 500, 600).
Preserve native narrow-input sizing where needed. The mock is a typography
reference: its invented ratings/dates/counts, decorative covers, icons, simplified
controls, and layout adaptations do not replace production data or interactions.
Production continues to compose the installed shadcn/Base UI components.

## Rejected: compact inspector

[The later experiment](compact-inspector-preview.html) reduces overview, facts,
source copy, and history to 12px / 400 while retaining 14px section headings.
The owner preferred the original Balanced version. Preserve this only as design
history. Its editable fragment is [compact-inspector.html](compact-inspector.html).

## Audit context

The origin/main baseline was 655ade4. Inspection covered all 16 Library sections,
major inspectors, filters and popups, search excerpts, and Connections. It found
16 rendered text sizes and six weights, including 8px summary details, 9px filter
counts, fractional rem-derived sizes, and inconsistent list/grid title roles.
Historical design entries were excluded from those production findings.
