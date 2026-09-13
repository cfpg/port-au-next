# GitHub App Integration: Manual Deploys with Installation Credentials

**Status:** Milestone 1 implemented (this document) - GitHub App configuration, per-app
repository connection, and authenticated manual deploys of private repositories through
the existing deployment queue.

**Push-triggered automatic deployment is NOT implemented yet.** Connecting an app to
GitHub only makes the existing manual "Deploy" button able to pull a private repository
with short-lived credentials. Pushing to the connected repository does nothing on its
own. Webhook receipt and auto-deploy are a separate, later milestone.

---

## What this milestone adds

- A platform-wide GitHub App configuration (Settings -> GitHub App).
- A per-app "Connect GitHub" flow that binds one app to one specific repository the App
  installation can access.
- Authenticated git clone/fetch for a connected app's manual deploys, using a short-lived
  GitHub App installation token instead of the host's SSH/git credentials.
- Support for creating an app whose initial clone is deferred until after it's connected
  (for a private repository that doesn't exist locally yet).

## What this milestone does NOT add

- A webhook receiver (no `/api/webhooks/github` route exists yet).
- Any code path that triggers a deployment from a `git push`.
- Commit status / check-run reporting back to GitHub.
- Any change to how apps that are *not* connected to GitHub behave - unconnected apps
  keep using the host's existing SSH/git configuration exactly as before.

---

## Operator setup

### 1. Register a GitHub App

In GitHub: **Settings -> Developer settings -> GitHub Apps -> New GitHub App** (works
under a personal account or an organization).

Required permissions:

| Permission | Access |
|---|---|
| Repository permissions -> Contents | Read-only |
| Repository permissions -> Metadata | Read-only |

No webhook subscription is required for this milestone (there's nothing listening yet).
If the GitHub UI requires a webhook URL to save the App, enter any placeholder HTTPS URL
and set **Webhook active** to unchecked. Set a **Webhook secret** anyway (any random
string) and record it - the next milestone will need it, and this platform stores it now
so you don't have to re-enter it later.

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
- Connecting a repository never enables anything automatically: it only makes the
  *manual* Deploy button on that app capable of authenticating. There's no "auto-deploy"
  flag in this milestone because there's nothing yet that would use one.

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
10. Push a commit to the connected repository. Confirm nothing happens automatically -
    this is expected; auto-deploy is not implemented yet.
