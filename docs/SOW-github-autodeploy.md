# GitHub App Integration: Connected Deploys, Auto-Deploy, and PR-Gated Previews

**Status:** v1 implemented (this document) - GitHub App configuration, per-app repository
connection, authenticated manual deploys of private repositories, and opt-in auto-deploy
(production on push; previews on pull request open/sync/reopen, torn down on close), all
through the same deployment queue.

---

## What v1 adds

- A platform-wide GitHub App configuration (Settings -> GitHub App).
- A per-app "Connect GitHub" flow that binds one app to one specific repository the App
  installation can access.
- Authenticated git clone/fetch for a connected app's deploys (manual or automatic),
  using a short-lived GitHub App installation token instead of the host's SSH/git
  credentials.
- Support for creating an app whose initial clone is deferred until after it's connected
  (for a private repository that doesn't exist locally yet).
- A public webhook receiver (`POST /api/webhooks/github`) that verifies each delivery's
  signature and durably enqueues work for every eligible, Auto-deploy-enabled app -
  production deploys from `push`, preview deploys/teardowns from `pull_request` - through
  the exact same queue and worker a manual Deploy click uses.
- A per-app **Auto-deploy** toggle (off by default, including for apps connected before
  this feature existed) that gates whether a production push or PR deploy actually queues
  anything. Closing a PR still tears down an existing preview even if Auto-deploy is off.

## What v1 does NOT add

- Commit status / check-run reporting back to GitHub.
- PR comments with the preview URL (would need Pull requests: Write).
- Fork PR previews (head repository must be the installed repo).
- Any lifecycle handling for `installation`/`installation_repositories` events
  (suspension, removal), or teardown on branch-delete (teardown is PR-close).
- Cancellation of queued preview deploys (except on PR close), prioritization, or a
  dedicated queue dashboard.
- Automatic reconciliation against GitHub for a delivery it gave up retrying (a documented
  gap - see "Missed deliveries" below).
- Any change to how apps that are *not* connected to GitHub behave - unconnected apps
  keep using the host's existing SSH/git configuration exactly as before.

---

## Operator setup

### 1. Register a GitHub App

In GitHub: **Settings -> Developer settings -> GitHub Apps -> New GitHub App** (works
under a personal account or an organization).

**Setup URL** (under "Identifying and authorizing users"): set this to

```
https://<deployment-manager-host>/api/github/installations/callback
```

and check **Redirect on update**. This is required, and is distinct from the OAuth
"Callback URL" field on the same page (this milestone doesn't use OAuth user login, only
the App installation flow). Without it, GitHub has nowhere to send the browser back to
after an installation completes - the connect flow will get stuck on GitHub's own
"manage installation" page and never call back to record the connection. "Redirect on
update" additionally makes GitHub redirect back here when an *existing* installation's
repository access changes (rather than only on a brand-new install), which the per-app
connect flow also relies on.

Required permissions:

| Permission | Access |
|---|---|
| Repository permissions -> Contents | Read-only |
| Repository permissions -> Metadata | Read-only |
| Repository permissions -> Pull requests | Read-only |

**Pull requests: Read** is required both to receive `pull_request` webhook deliveries and
for the worker's "are there other open PRs on this head branch?" check before tearing a
preview down. Do not grant Pull requests: Write - this slice does not comment on PRs.

If this App already existed with only Contents + Metadata, saving the new permission
sends GitHub's additional-permissions request. **Each installation must accept that
request** or `pull_request` events will not be delivered. Update the GitHub App
(permission + event subscription) and accept it **before** shipping code that stops
queueing previews from non-production pushes.

**Webhook** (a separate section from the Setup URL above, and a different URL): check
**Active**, set **Webhook URL** to

```
https://<deployment-manager-host>/api/webhooks/github
```

and set a **Webhook secret** (any random string) - paste this same value into the
platform's config in step 3 below, since every delivery's `X-Hub-Signature-256` is
verified against it before anything else happens. Under **Permissions & events ->
Subscribe to events**, check **Push** (production auto-deploy) and **Pull request**
(preview auto-deploy and teardown). Skip either and that half of Auto-deploy has nothing
to enqueue from, even once toggled on per-app.

Where you can install it: choose "Only on this account" or "Any account" depending on
whether the repositories you'll connect live under your own account or an organization.

### 2. Generate a private key

On the App's page, under **Private keys**, click **Generate a private key**. This
downloads a `.pem` file. You'll paste its full contents (including the
`-----BEGIN ... PRIVATE KEY-----` / `-----END ... PRIVATE KEY-----` lines) into the
dashboard - keep the file itself somewhere safe as a backup, since GitHub won't show it
again.

### 3. Configure the platform

In the deployment-manager dashboard: **Settings -> GitHub App**. Enter:

- **App slug** - from the App's public page URL, `github.com/apps/<slug>`.
- **App ID** - shown on the App's settings page.
- **Client ID** - optional, not used by this milestone.
- **Webhook secret** - the value you set in step 1.
- **Private key** - the full `.pem` contents from step 2.

The private key and webhook secret are encrypted at rest (same AES-256-GCM scheme as
Cloudflare's API token - see `src/lib/encryption.ts`) and are never returned to the
browser; the settings page only ever shows a masked `****last4`.

Alternatively, set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (escaped `\n` newlines are
accepted), `GITHUB_WEBHOOK_SECRET`, and optionally `GITHUB_APP_SLUG` /
`GITHUB_APP_CLIENT_ID` as environment variables instead - these take precedence over the
database row, matching the existing `BUGSINK_API_TOKEN`-style env-override convention.

### 4. Connect an app to a repository

On an app's settings page: **GitHub -> Connect GitHub**. This redirects to GitHub's
installation flow. Install the App on the account/org that owns the repository, granting
it access to that specific repository (or "all repositories" if you prefer, though
per-repo access is the smaller footprint).

GitHub redirects back to the app's settings page. The platform automatically finds the
one repository in the installation's access list that matches the app's configured
`repo_url` - there's no manual repository picker, and connecting one app can never be
redirected onto a different codebase than the one it's configured for. If the
installation doesn't have access to the exact repository this app needs, you'll see a
clear error explaining that; grant access to that repository on GitHub and click Connect
again.

### 5. Creating a new app with a private repository

When registering a new app, check **"Private repository - skip cloning now, I'll connect
GitHub App from this app's settings first"**. This creates the app record and database
without attempting to clone. After creating it, go to that app's settings and connect
GitHub (step 4). Once connected, go to the app's own page and click **Deploy** - this
performs the first (authenticated) clone and build together, through the same manual
deploy queue every other deployment uses.

### 6. Enable Auto-deploy (optional, per app)

Connecting GitHub (step 4) only makes the manual Deploy button able to authenticate -
**it never enables auto-deploy by itself**, for a newly connected app or one connected
before this feature existed. On the app's settings page, once connected, flip the
**Auto-deploy** switch. The platform validates the connection still matches the app's
current repository before allowing this to turn on.

With it enabled:

- A push to the app's configured production branch queues a normal deployment of the
  pushed commit.
- A push to any other branch is acknowledged and ignored (`preview_requires_pull_request`).
  Preview identity stays `app + branch`; GitHub pull requests are only the trigger.
- Opening, synchronizing, or reopening a pull request whose head is in the connected
  repository (not a fork) and is not the production branch queues an isolated preview
  deployment of that head branch at `head.sha` - but only if **Preview Branches** is also
  enabled for that app with a preview domain configured. Otherwise the delivery is
  acknowledged and nothing is queued.
- Closing a pull request (merged or not) queues a **teardown** of that head branch's
  preview: stop the container, remove nginx, drop the per-branch database, delete the
  `preview_branches` row. Teardown does **not** require Auto-deploy to still be on.
  If another open PR still uses the same head branch, teardown is skipped. Queued
  (not running) deploy jobs for that branch are cancelled when the teardown is accepted.
- Every deployment - manual or automatic, production or preview, for every app on this
  platform - and every preview teardown shares the one global queue and worker (see the
  existing deployment-queue docs/behavior). Work can and will wait behind other work;
  nothing runs concurrently.
- **Disabling** Auto-deploy stops NEW production pushes and PR deploys from being queued.
  A job already accepted before you disabled it keeps running to completion. Closed PRs
  still tear down an existing preview.
- **Disconnecting** GitHub from an app always leaves Auto-deploy disabled, even if it was
  on beforehand. Reconnecting (to the same or a different installation/repository) never
  silently re-enables it - it must be turned on again explicitly, and only once the new
  connection is in place.
- A queued production push or PR deploy always deploys the **exact commit SHA GitHub
  reported** (`push.after` or `pull_request.head.sha`), never "whatever the branch tip
  happens to be by the time the worker gets to it." If that exact commit can no longer
  be fetched or resolved by the time the job runs (e.g. it was force-pushed away before
  the worker reached it), the job fails visibly in the deployment history with a redacted
  error - it never silently substitutes the current branch tip instead.

### Missed deliveries and redelivery

**GitHub does not automatically redeliver a failed or unreachable delivery.** If this
platform was down, misconfigured, or returned an error when GitHub attempted a delivery,
that push will not automatically be retried by GitHub itself. To recover manually: on the
App's page, go to **Advanced -> Recent Deliveries**, find the delivery, and click
**Redeliver**. Redelivering an already-accepted delivery is safe - it's deduplicated by
GitHub's own `X-GitHub-Delivery` id (see below) and will not queue a second deployment.
Automated reconciliation against GitHub's delivery history (polling for anything missed
without a manual redeliver) is out of scope for v1.

---

## How the credentials flow (for anyone auditing this)

- Installation tokens are minted on demand (`POST
  /app/installations/{id}/access_tokens`, scoped to the connected repository's numeric
  ID via `repository_ids`), cached in memory for their ~1 hour lifetime minus a 60 second
  safety margin, and never persisted to disk or the database.
- A token is only ever placed in a git subprocess's own environment
  (`GIT_ASKPASS`/`GIT_TOKEN`), via `execFile`'s per-call `env` option - never in
  `process.env` globally, never in a URL, never as a command-line argument. The askpass
  helper script itself is generated at runtime (into the OS temp directory) rather than
  shipped as a repo file, so it doesn't depend on a Docker build step to exist.
- The git remote (`origin`) for a connected app is always the credential-free
  `https://x-access-token@github.com/owner/repo.git` - no secret ever touches
  `.git/config`.
- Any token that is registered gets added to the existing additive log-redaction set
  (`logger.setRedactionContext`) before the git operation runs, so it's masked in logs,
  subprocess error messages, and the deploy queue's stored error field alike.
- Connecting a repository never enables anything automatically: it only makes the Deploy
  button on that app capable of authenticating (manual or, once separately opted into,
  automatic). Auto-deploy is a distinct, explicit, per-app opt-in (`app_features`,
  default OFF) - see "Enable Auto-deploy" above.
- A webhook-triggered queue job also records the exact installation and repository id it
  was accepted against. Before doing any git or credential work, the worker re-checks
  that against the app's *current* connection; if the app was disconnected, reconnected,
  or repointed at a different installation/repository while the job sat in the queue, the
  job fails cleanly rather than deploying through a different credential or repository
  than the one the push was originally accepted for.

## Webhook delivery verification and eligibility

- `POST /api/webhooks/github` is the one route in this app that intentionally sits
  outside session authentication (see `middleware.ts`'s narrow, exact-pathname-and-POST
  exception) - GitHub has no session cookie to send. Its own authentication is the
  `X-Hub-Signature-256` HMAC-SHA256 check against the configured webhook secret,
  verified with a timing-safe comparison over the raw request bytes before anything else
  runs (see `src/lib/githubWebhook.ts`, GitHub's own ["Validating webhook
  deliveries"](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)).
  A missing/invalid signature is rejected outright; nothing about the payload is even
  parsed first.
- `push` events to a branch ref (`refs/heads/...`) with a real, non-zero commit SHA
  are considered for **production** auto-deploy only. A `ping` (signed, sent when the
  webhook is first saved) is acknowledged without deploying. Tag pushes, branch
  deletions, the all-zero SHA GitHub can send alongside a deletion, and pushes to
  non-production branches are all acknowledged and ignored, never treated as errors.
- `pull_request` events with action `opened`, `synchronize`, or `reopened` queue a
  preview deploy of `head.ref` at `head.sha`. Action `closed` queues a preview teardown.
  Other actions (`edited`, `labeled`, `assigned`, …), fork PRs (`head.repo.id` != the
  installed `repository.id`), and PRs whose head is the app's production branch are
  acknowledged and ignored. Draft PRs are deployed the same as ready ones.
- A single delivery can queue a job for **more than one app**, if more than one app on
  this platform is connected to the same installation+repository - every eligible app
  gets its own job, not just the first match. Production pushes and PR deploys still
  require Auto-deploy; PR-close teardown only requires a live preview row.
- Deduplication is by GitHub's own `X-GitHub-Delivery` id, per app, via a durable database
  constraint (not an in-memory cache) - a redelivery of the same delivery id, even after
  the original job already finished (successfully or not), or arriving concurrently from
  more than one GitHub retry, never queues a second deployment for the same app.
- The route only validates and enqueues; it returns as soon as the enqueue transaction
  commits (`202` for newly accepted work, `200` with a small outcome for an ignored event
  or a duplicate) and never waits for the deployment itself to run, call the GitHub API,
  touch git, or provision any infrastructure.
- The request body is capped at 2 MiB - far larger than any realistic `push` or
  `pull_request` payload, but bounded rather than unbounded.

## Trust model for the connect flow

This is a single-operator platform with no per-app permission system elsewhere in the
dashboard - any authenticated session can already manage every app. The connect callback
matches that: it verifies a short-lived, single-use, unpredictable state token (bound to
the app and the session that started the flow) and independently confirms with GitHub's
API that the returned installation genuinely belongs to this platform's App - but it does
not attempt to verify the underlying GitHub user's personal repository permissions
beyond what the installation itself grants.

---

## Manual acceptance test (private repository)

Requires an actual GitHub App registered per the steps above, and a private repository
the App can be installed against. Not run as part of this implementation - do this once
you're ready to verify in your own environment.

1. **Register a new app** with the private repository's URL, checking the "skip cloning"
   box. Confirm the app is created and its settings page loads.
2. **Connect GitHub** from that app's settings. Confirm the redirect to GitHub, complete
   the installation (or reuse an existing installation and grant it access to this
   repository), and confirm you land back on the settings page with a "GitHub connected"
   toast and the connected account/repository shown.
3. **Replay check:** manually reload the callback URL from your browser history (with the
   same `state` value) - confirm it now shows an error (state already used), not a
   duplicate connection.
4. Confirm the settings page shows a callout that the app hasn't been built yet.
5. Go to the app's main page and click **Deploy**. Confirm the deployment queues,
   transitions through the normal building/preflight statuses, and completes - this is
   the first clone happening authenticated, through the ordinary queue worker.
6. Check the deployment logs for that deployment: confirm no token value appears
   anywhere in the log output.
7. On the host, confirm `git -C <app-checkout>/.git/config` shows `origin` as
   `https://x-access-token@github.com/owner/repo.git` with no token embedded.
8. Trigger a second manual deploy of the same app. Confirm it succeeds without needing to
   reconnect (the token is re-minted transparently).
9. Disconnect GitHub from the app's settings, then try Deploy again - confirm it now
   fails cleanly (falls back to attempting the host's own git credentials, which won't
   have access to a private repo) rather than silently reusing a stale token.
10. Push a commit to the connected repository with Auto-deploy still off (or GitHub
    disconnected). Confirm no job is created.

## Manual acceptance test (auto-deploy)

Continue from a connected app (reconnect if you disconnected it in step 9 above).
Requires the App's webhook to actually be enabled and reachable per "1. Register a GitHub
App" above (a local tunnel such as `ngrok`/`smee.io` works for a dev environment).

1. Reconnect GitHub if needed, then enable **Auto-deploy** on the app's settings page.
   Confirm the toggle rejects turning on if attempted on a disconnected app or one whose
   repository has diverged from its connection (test by temporarily editing the app's
   repo URL, if convenient).
2. Push a commit to the app's configured production branch. Confirm GitHub's **Recent
   Deliveries** shows a `202` response, a queue row appears (Deployment History /
   Applications table / sidebar - no manual refresh needed), and it deploys the exact
   pushed commit SHA.
3. Push two commits in rapid succession. Confirm two separate queue rows are created, each
   recorded against its own distinct SHA, processed strictly in the order they were
   accepted - not both deploying whatever the branch tip became by the time the worker got
   to the first one.
4. While a push-triggered job is running (or queued), trigger a manual Deploy on a
   different app. Confirm it queues behind/alongside the webhook job in the same global
   queue rather than running concurrently.
5. In GitHub's **Recent Deliveries**, click **Redeliver** on the delivery from step 2.
   Confirm the response is a successful `200` (not `202`) and no second deployment is
   created.
6. With **Preview Branches** enabled and a preview domain configured, push a commit to a
   non-production branch that has **no** open PR. Confirm the delivery is acknowledged
   (`preview_requires_pull_request` / nothing queued) and no preview is provisioned.
7. Open a pull request from that branch. Confirm a preview deploys at the branch
   subdomain. Push another commit to the PR (synchronize). Confirm a second preview
   deploy of the new SHA. Close the PR. Confirm the preview is torn down (container
   stopped, nginx gone, preview row gone). Reopen the same PR. Confirm the preview is
   created again.
8. Disable Preview Branches (or clear the preview domain) and open a different PR -
   confirm that delivery is acknowledged but nothing is queued or provisioned. A fork PR
   (head repo != this repo) is likewise ignored.
9. Push a tag (not a branch) and delete a branch. Confirm neither creates a queue row,
   deployment, or any provisioning/deletion side effect.
10. Disable Auto-deploy, then push the production branch again. Confirm no new production
    job is created but any job already queued before disabling still completes. Close a
    PR whose preview still exists - confirm teardown still runs.
11. Disconnect GitHub, then reconnect (potentially to a different installation). Confirm
    Auto-deploy is off after reconnecting and must be explicitly re-enabled - it does not
    come back on by itself.
12. With a job still queued (e.g. behind another deployment), disconnect GitHub from that
    app or edit its repo URL to point elsewhere, then let the worker reach that job.
    Confirm it fails visibly in the deployment history with a redacted error, rather than
    deploying through the old credential or a mismatched repository.
