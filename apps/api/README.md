# API

The Hono REST API and Cloudflare request, queue, and scheduled-event entry points. Platform bindings stay at this boundary.

`wrangler.jsonc` defines credential-free local D1, R2, Queue, Cron, and static asset
bindings. The placeholder resource IDs are suitable only for local development;
replace them with provisioned Cloudflare resources before deployment.
