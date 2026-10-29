# One-time deployment account setup

The remaining account credentials must be created by the owner. Existing
Wrangler OAuth can deploy interactively but does not provide the account
Analytics Read scope needed by the persistent monitor, and must not become a
GitHub CI credential. Existing SSH Git authentication already permits workflow
pushes; another GitHub OAuth grant is unnecessary.

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
GETs for its exact Client ID. The current Cloudflare connection lacks Access Service Tokens permission,
confirmed by a403 read-only permission probe. Reconnect it with
`access-service-token.write` and Access application/policy write permissions,
or create the service token and Service Auth policy through the dashboard.
Do not broaden either runtime or CI API token to solve this setup-only need. Its secret belongs only in the protected
GitHub environments. It never substitutes for owner sign-in/MFA.

## Independent backups

Choose an existing destination you control outside the production Cloudflare
account: an already backed-up/synchronized folder, external drive, or existing
private object storage. Do not purchase a service just for this step. The operator
will verify the existing private recovery bundle, preserve its evidence/search
format, and record the actual copy and recovery rehearsal. A TimeTravel bookmark
or another object in the same account is not an independent backup.

## Current GitHub setup

The `production` and `production-migrations` environments are provisioned for
`main` only; migrations require an owner review with self-approval allowed.
Production delivery remains disabled until credentials, smoke identity, migration
bootstrap and the first successful validation are verified. See the
[release runbook](release-and-recovery.md) for exact protected secrets.
