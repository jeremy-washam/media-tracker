# One-time deployment account setup

The owner supplied both scoped account tokens on October 29. Both are active;
D1 and queue reads and the monitor's exact analytics query passed. The current
usage estimate is $5. The dashboard showed $0 usage overages; native alerts are
saved at $5 usage warning and $20 usage emergency, approximately $10/$25 total
including the existing $5 subscription. The release token is installed in both protected GitHub
environments; the monitor secret is active in the maintenance deployment. Existing
Wrangler OAuth remains separate from persistent runtime and CI credentials.

## Create two scoped Cloudflare API tokens

Use the existing account, with no zones/DNS or billing write permissions and no
API-token-management permission. These links prefill the official token form;
review the resulting permissions before creation. No paid service is added.

1. [Create the operating monitor token](https://dash.cloudflare.com/?to=/:account/api-tokens&permissionGroupKeys=%5B%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22queues%22%2C%22type%22%3A%22edit%22%7D%5D&name=Imladris%20operating%20monitor). Permissions: Account Analytics Read, D1 Read, Queues Edit. Save only the token value in the ignored, mode 0600 file`.private/deployment/operating-api-token.txt` in the main repository checkout.
2. [Create the release automation token](https://dash.cloudflare.com/?to=/:account/api-tokens&permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22queues%22%2C%22type%22%3A%22read%22%7D%5D&name=Imladris%20release%20automation). Permissions: Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, Queues Read. Save only its value in`.private/deployment/release-api-token.txt` in the main checkout.

Do not paste either token into chat. Keep a password-manager copy. The deployment
operator installs the monitor token as the existing Worker's
`OPERATING_API_TOKEN` secret and the release token as protected GitHub environment
secrets, validates each permission, then removes temporary input files after
successful installation. Provider credentials and encryption keys are separate
and are never copied into CI.

The official[Cloudflare token template documentation](https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/)
defines these permission keys. If the dashboard drops a permission or the
account-token form is unavailable, stop and report the visible form; do not
substitute a global API key or grant broad account administration.

## Private release verification identity

A dedicated Access service token and Service Auth policy are also required.
The Worker independently permits only queryless health and six Library-summary
GETs for its exact Client ID. On October 29 the owner approved dashboard creation
of this identity; its Service Auth policy is attached and its credentials are
installed in both protected GitHub environments. Owner MFA remains unchanged.
Creation through the API connection returned 403, so neither runtime nor CI
API token was broadened to perform this setup. The identity never substitutes
for owner sign-in/MFA.

## Local backup destination

The owner accepted a protected folder on the Mac, outside the repository and
Cloudflare, as the default recovery destination. This protects against provider
or account loss; it does not protect against losing the Mac. An additional
offsite copy is optional and is not a deployment blocker. No new service is
required.

Current live database and object data total about 1.5 GB. Reserve 5–6 GB for the
full recovery bundle, which also contains transfer data and restore-test copies.
The retained original bundle passed verification and has been copied to
`/Users/jeremywasham/Backups/Imladris/original-cutover-2026-10-13`; that separate
Mac copy passed verification at 21:59:41 UTC: 94 tables, 1,798,348 rows, 18,126
objects and the independently restored search vocabulary. Fresh read-only production capture has started
under the held writer pause; its restore verification remains pending. A Time Travel bookmark or
another object in the same Cloudflare account does not replace the local copy.

The owner explicitly approved a separate encryption-key backup. It is saved and
verified in the owner-only `/Users/jeremywasham/Backups/Imladris/credentials`
folder. Possession of this key and the database permits decryption of the stored
Spotify credential; keep both protected. Provider credentials are never copied
into CI.

## Current GitHub setup

The `production` and `production-migrations` environments are provisioned for
`main` only; migrations require an owner review with self-approval allowed.
[PR 8](https://github.com/jeremy-washam/media-tracker/pull/8) is merged. Hosted
[main validation 40949037008](https://github.com/jeremy-washam/media-tracker/actions/runs/40949037008)
passed at `651a2be`; main requires the strict `validate` check. Production delivery
remains disabled during the controlled migration bootstrap and live acceptance.
Maintenance code was deployed at 21:53:50 UTC on October 29 with the operating
gate closed. Zero active source/catalog leases were confirmed at 21:59 UTC;
read-only backup capture is running during the held pause. SQL migrations wait
for both the 20-minute pause and verified fresh recovery bundle. See the
[release runbook](release-and-recovery.md) for exact protected secrets.
