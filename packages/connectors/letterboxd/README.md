# Letterboxd connector

Status: official reconnaissance, private account-export probe, and live RSS
polling probe complete. Production raw storage/normalization is not implemented.

This package will own account-export backfill, best-effort RSS reconciliation,
and source-specific normalization. See the
[Letterboxd source reconnaissance](../../../docs/sources/letterboxd.md) for the
current capability assessment, field inventory, limitations, and probe plan.

Run the content-free export summary from the repository root:

```sh
pnpm --filter @media-tracker/connector-letterboxd probe:export -- exports/<letterboxd-export>.zip
```

Run two public RSS polls and compare their entry identities and hashes:

```sh
pnpm --filter @media-tracker/connector-letterboxd probe:rss -- <username>
```
