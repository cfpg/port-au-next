# Statement of Work: First-Class Bugsink Source-Map Support

**Project:** Port-Au-Next — build-time source-map generation, debug-ID injection, and artifact upload  
**Date:** 2026-09-10  
**Status:** POC implemented on development branch; application-level end-to-end symbolication pending
**Initial framework scope:** Next.js applications using a Port-Au-Next-managed Dockerfile  
**Depends on:** Existing Bugsink provisioning, generated Next.js Dockerfiles, BuildKit image builds, and the green-deployment release pipeline

---

## 1. Executive summary

Port-Au-Next already provisions a Bugsink team and project per production application and injects that project's Sentry-compatible DSN into application builds and runtime containers. This is sufficient to deliver error events, but it is not sufficient to symbolicate minified browser or server stack frames.

This proposal adds a separate build-time source-map pipeline:

```text
Next.js build
  → verify source maps
  → inject matching debug IDs into JavaScript and source maps
  → upload an artifact bundle to the app's Bugsink project
  → delete source maps from runtime-bound browser assets
  → assemble and deploy the runner image from the injected JavaScript
```

The initial implementation should be automatic only for Port-Au-Next-managed Next.js Dockerfiles. Application-owned Dockerfiles are an explicit trust and integration boundary: Port-Au-Next cannot safely infer their build stages or output paths, and the only Bugsink upload token currently available to the platform is a global privileged token. The first release should therefore report custom Dockerfiles as application-managed rather than silently modifying them or exposing that token.

The source-map uploader should be designed as a generic build capability, while Next.js-specific generation, output discovery, and verification remain in a framework adapter. This permits future Vite, Remix, Nuxt, or other adapters without coupling Bugsink upload logic to `.next` forever.

When automatic source maps are explicitly active, injection or upload failure should fail the deployment. Continuing would deploy a unique set of bundles whose matching artifacts are missing; rebuilding later can produce different chunk hashes and debug IDs.

---

## 2. Problem statement

A production Next.js browser event can currently reach Bugsink with frames such as:

```text
app:///_next/static/chunks/4bd1b696-2dafebb596faf2c0.js
```

Without a matching source map, Bugsink cannot translate that minified location to its original TypeScript or React source. A runtime DSN only controls event ingestion. Source-map upload requires a separate authenticated build operation.

Bugsink's current documented mechanism uses Sentry artifact bundles and debug IDs:

1. The framework emits JavaScript source maps containing `sourcesContent`.
2. `sentry-cli sourcemaps inject` adds a common debug ID to a JavaScript artifact and its map.
3. `sentry-cli sourcemaps upload` uploads the resulting artifact bundle.
4. The exact debug-ID-injected JavaScript is deployed.
5. An event emitted by that JavaScript carries the debug ID, allowing Bugsink to select the matching artifact deterministically.

Bugsink does not fetch deployed JavaScript or maps from application URLs. Artifact upload is therefore required even if the application exposes source maps publicly. Bugsink documents this flow for version 2.0.14 or later and warns that only the standard `sentry-cli` upload path is a guaranteed compatibility surface.

References:

- [Bugsink source-map documentation](https://www.bugsink.com/docs/sourcemaps/)
- [Bugsink Vite integration guide](https://www.bugsink.com/docs/vite-integration-guide/)
- [Sentry CLI source-map documentation](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/)

---

## 3. Goals

1. Symbolicate browser errors from supported, production-built Next.js applications.
2. Symbolicate supported Next.js server frames where the deployed standalone artifacts and emitted maps permit it.
3. Upload artifacts from the exact build whose JavaScript is placed in the runtime image.
4. Keep the Bugsink upload token out of Dockerfile text, build arguments, image layers, build logs, application `.env` files, and runtime containers.
5. Avoid publicly serving browser `.map` files after a successful upload.
6. Fail clearly when an explicitly enabled automatic upload cannot complete.
7. Preserve current behavior when Bugsink is disabled.
8. Treat platform-managed and application-owned Dockerfiles differently and visibly.
9. Separate framework-specific map production from generic Bugsink artifact upload.
10. Provide evidence in deployment logs without exposing credentials.

---

## 4. Non-goals for the first release

| Item | Reason |
|---|---|
| Rewriting arbitrary application-owned Dockerfiles | Stage names, build commands, output locations, and runtime copies are not safely inferable from Dockerfile text. |
| Uploading maps during application startup | This repeats work on restarts, requires privileged build credentials at runtime, and can upload artifacts different from the deployed client bundles. |
| Using `instrumentation.ts` as an uploader | Next.js instrumentation is a runtime hook and may execute in multiple processes or runtimes. |
| Supporting every JavaScript framework immediately | The existing managed templates are specifically Next.js standalone templates. |
| Retroactive symbolication guarantees | Previously received events should not be assumed to be reprocessed after artifacts are uploaded. |
| Public source-map hosting | Bugsink uses artifact uploads; public maps are unnecessary and expose application source. |
| Parsing and mutating `withSentryConfig(...)` options automatically | Next.js config is executable JavaScript/TypeScript, not a reliably editable data file. |
| Per-preview Bugsink projects in phase one | Current Bugsink integration is production-only and stores one non-preview project per app. |

---

## 5. Current Port-Au-Next architecture

### 5.1 Bugsink provisioning

`deployment-manager/src/services/bugsink.ts` currently owns application-level Bugsink integration:

- `provisionBugsinkForApp(app)` creates or reuses a hidden team and project.
- The project ID and team ID are stored in `app_services.public_key` and `app_services.secret_key`.
- The project slug is resolved from the Bugsink API.
- A per-app dashboard user and password are provisioned for human access.
- `getBugsinkAppCredentials(appId)` returns project identity, slug, DSN, and dashboard credentials.
- `getBugsinkEnvVarsForProductionApp(app)` injects only:

```text
SENTRY_DSN
NEXT_PUBLIC_SENTRY_DSN
SENTRY_ENVIRONMENT=production
```

This method is called by `getPlatformAppEnvVars` in `deployment-manager/src/services/appEnv.ts`, and only for production deployments. Preview deployments do not currently receive Bugsink credentials.

The DSN is an ingestion credential. It must not be reused as the artifact-upload credential.

### 5.2 Platform Bugsink API token

`deployment-manager/src/services/bugsinkToken.ts` manages one platform-wide Bugsink API token:

1. `BUGSINK_API_TOKEN` from the deployment-manager environment is preferred when present.
2. Otherwise an encrypted token is loaded from `platform_service_secrets` under `bugsink_api_token`.
3. If neither valid token exists, `bugsink-manage create_auth_token` runs inside the Bugsink service.
4. The token is validated against the canonical teams API.
5. The token is encrypted before database storage by `platformServiceSecretsQuery.ts`.

This is already the credential shape documented by Bugsink for authenticated source-map uploads. It is therefore the simplest phase-one upload credential.

However, it is a global privileged token, not an app-scoped secret. Giving it to an untrusted application-owned Dockerfile would allow that Dockerfile to read and potentially exfiltrate it during build. Phase one must pass it only to a platform-owned Dockerfile whose contents and secret mount are controlled by Port-Au-Next.

### 5.3 Error-tracking UI

`deployment-manager/src/components/settings/ErrorTrackingCard.tsx` currently presents one Bugsink enable/disable switch and documents runtime SDK setup. It does not report source-map capability or upload state.

The UI correctly tells users to redeploy because `NEXT_PUBLIC_SENTRY_DSN` is consumed at build time. The source-map feature should extend this card rather than introduce an unrelated settings area.

### 5.4 Generated Dockerfiles

`deployment-manager/src/services/generatedDockerfileTemplates.ts` defines two managed templates:

- `buildNextDockerfile`: standard Next.js standalone runner.
- `buildPrismaDockerfile`: Next.js standalone runner plus Prisma build artifacts and a `migrator` target.

Both templates currently perform:

```text
deps: npm ci
builder: COPY source → npm run build
runner: copy public, .next/standalone, and .next/static
```

The runner does not copy all of `.next`. Any source-map implementation must operate on the artifact copies that ultimately feed these two runner `COPY` instructions.

The generated Dockerfile includes a marker parsed by `deployment-manager/src/utils/generatedDockerfileMarker.ts`. The current marker version is `6`, and the only feature flag represented in it is `uses_prisma`.

`ensureDockerfile` in `deployment-manager/src/services/docker.ts` behaves as follows:

- No Dockerfile: write a managed template.
- Dockerfile without a recognized marker: treat it as application-owned and leave it unchanged.
- Managed marker with an old version or mismatched Prisma flag: regenerate it.
- Current managed marker: retain it unchanged.

Consequently, changing source-map behavior in the managed template requires either:

- bumping `GENERATED_DOCKERFILE_VERSION`, or
- adding source-map capability to the desired marker flags and regeneration comparison.

A template that conditionally runs source-map work only when a secret/configuration is supplied can avoid per-app template forks. A version bump is still required so existing managed Dockerfiles receive the new stage graph.

### 5.5 Image builder

`buildImage` in `deployment-manager/src/services/docker.ts` currently constructs and executes this conceptual command:

```text
DOCKER_BUILDKIT=1 docker build [--target ...] -t <tag> -f <Dockerfile> <projectDir>
```

Relevant properties:

- BuildKit is enabled.
- Build output is redirected to a per-deployment file.
- There is no `--secret` support.
- Docker commands are assembled as shell strings and executed with `child_process.exec` through `deployment-manager/src/utils/docker.ts`.
- The complete build-log tail is later read and passed through `redactLogText`.
- `execCommand` separately redacts known platform environment secrets, including `BUGSINK_API_TOKEN` when it came from process environment.

The database-stored Bugsink token is not automatically in `getPlatformSecrets()`. If it is loaded only for a build, it must be added to the active redaction context for the duration of that build or passed explicitly to redaction. Redaction is defense in depth; the token should never appear in a command argument or CLI output in the first place.

The shell-string command construction is already sensitive to spaces and metacharacters in project paths and tags. Adding secret file paths, URLs, and project slugs increases the risk. The preferred implementation should introduce an argument-array execution path using `spawn` or `execFile` for Docker builds.

### 5.6 Release pipeline and duplicate builds

`deployment-manager/src/services/releasePipeline.ts` performs:

```text
merge app environment
  → ensure Dockerfile
  → mutate Next.js config for standalone output
  → write project .env
  → build runner image
  → optionally build migrator image
  → start green container
  → process/readiness checks
  → optionally run Prisma migrations
  → switch nginx traffic
```

`buildReleaseImages` currently invokes `docker build` once for the default runner image and, when automatic Prisma migration is active, a second time with `--target migrator`.

Source-map upload must not run in both builds. The managed Dockerfile stage graph should branch so that:

```text
builder
├── migrator                 # selected by --target migrator; no upload
└── bugsink-symbolication    # selected only on the runner path
    └── runner
```

With this shape, the default runner build performs upload exactly once. The later targeted migrator build stops at `migrator` and cannot reach the symbolication stage.

### 5.7 Next.js config mutation

`deployment-manager/src/services/nextConfig.ts` currently modifies an application's Next.js config to force `output: "standalone"` and optionally adjust image cache TTL. It supports several common export shapes through regular-expression replacement.

This mechanism is already useful but is not a general JavaScript parser. It should not attempt to find and rewrite arbitrary nested `withSentryConfig` options such as:

```ts
sourcemaps: { disable: true }
```

The application contract should make map generation explicit. Port-Au-Next can validate the resulting build output and produce an actionable failure when an application configuration suppresses required maps.

### 5.8 Environment and `.env`

The pipeline currently merges platform and application values, writes them to `<projectDir>/.env`, and then runs `docker build`. The generated Dockerfile executes `COPY . .`, so build-time public and private environment data are part of the build context unless excluded by the application's `.dockerignore`.

The Bugsink upload token must never be added to `appEnv` or this `.env` file. It should remain in deployment-manager memory, be materialized only as a restrictive temporary secret file, be mounted into one BuildKit `RUN`, and be deleted immediately after the build command completes.

`PORT_AU_NEXT_BUGSINK_SOURCEMAPS=1` is non-secret and may be supplied as a build-time application flag. It should not imply that `SENTRY_AUTH_TOKEN` is available to the application build process.

---

## 6. Proposed capability model

Error ingestion and source-map automation should be modeled separately.

### 6.1 User-facing states

When Bugsink is enabled, the Error Tracking card should report one of:

| State | Meaning |
|---|---|
| `automatic` | The app uses a Port-Au-Next-managed Next.js Dockerfile and source-map upload will be enforced on its next production deploy. |
| `application-managed` | The app owns its Dockerfile; Port-Au-Next does not upload maps automatically. Integration instructions are shown. |
| `disabled` | Bugsink ingestion is enabled, but source-map automation has been explicitly disabled. |
| `unsupported` | Framework/build output cannot currently be handled safely. |
| `configuration-required` | The managed adapter is available, but the application did not emit usable maps. |

The first release need not persist every state. `automatic` versus `application-managed` can be derived from the Dockerfile marker, and enabled/disabled policy can be stored in `app_features.config` if a user toggle is required.

### 6.2 Recommended persistence

Add a feature identifier rather than overloading `app_services`, because `app_services` represents Bugsink project credentials while source maps are deployment behavior:

```text
AppFeature.BUGSINK_SOURCEMAPS = "bugsink_sourcemaps"
```

Suggested config:

```json
{
  "mode": "automatic",
  "failure_policy": "fail"
}
```

For phase one, `failure_policy` should accept only `fail`. Keeping the field makes the policy explicit and leaves room for a future `warn` mode without changing the data shape.

Automatic mode should be offered only when:

- Bugsink is enabled for the app.
- The Dockerfile is platform-managed.
- The project is detected as Next.js.
- A usable Bugsink URL, project slug, and API token are available.

### 6.3 Production-only behavior

The current Bugsink DSN integration is production-only. Phase-one source-map upload should follow the same boundary:

- Production/default branch: eligible.
- Preview branch: no upload and no upload secret.

If preview Bugsink projects are added later, each preview must have a clearly isolated project identity before source maps are enabled there.

---

## 7. Proposed module boundaries

### 7.1 Framework adapter

Add a framework-neutral interface, for example in `deployment-manager/src/services/sourceMaps/types.ts`:

```ts
interface SourceMapFrameworkAdapter {
  id: string;
  detect(projectDir: string): Promise<boolean>;
  buildFlagEnv(): Record<string, string>;
  managedDockerfilePlan(): SourceMapArtifactPlan;
}

interface SourceMapArtifactPlan {
  injectPaths: string[];
  uploadPaths: string[];
  privateMapPaths: string[];
  deployedJavaScriptPaths: string[];
}
```

The initial `NextJsSourceMapAdapter` owns:

- Next.js detection from `package.json`.
- The build flag exposed to application configuration.
- Expected standalone artifact paths.
- Verification that maps exist and contain `sourcesContent`.
- Verification that deployed JavaScript contains injected debug IDs.
- Verification that browser maps are absent from the runner image.

The exact paths must be established through a fixture build rather than fixed from assumption. In particular, compare:

- `.next/static`
- `.next/server`
- `.next/standalone`
- `.next/standalone/.next/server`
- any duplicated server artifacts included by output-file tracing

### 7.2 Bugsink uploader

Add a generic service, for example `deployment-manager/src/services/sourceMaps/bugsinkUploader.ts`, responsible for:

- Resolving the public Bugsink base URL.
- Resolving the app's project slug.
- Resolving the upload token without adding it to application env.
- Constructing the BuildKit secret specification.
- Providing validated non-secret build parameters.
- Reporting sanitized failure messages.

It must not contain Next.js path knowledge.

### 7.3 Deployment source-map plan

Before building, `runReleasePipeline` should resolve a plan:

```ts
type DeploymentSourceMapPlan =
  | { mode: 'off'; reason: string }
  | {
      mode: 'automatic';
      framework: 'nextjs';
      bugsinkUrl: string;
      projectSlug: string;
      authToken: SecretValue;
    }
  | { mode: 'application-managed'; reason: string };
```

This plan is passed to `ensureDockerfile` and `buildReleaseImages`. It is not merged into runtime `appEnv`.

Keeping a plan object makes the security boundary visible in function signatures and prevents accidental token propagation through ordinary environment merging.

---

## 8. Managed Next.js Dockerfile design

### 8.1 Required stage ordering

The generated templates should implement this logical ordering:

```text
FROM builder AS bugsink-symbolication

verify emitted maps
  → inject debug IDs
  → verify injection
  → upload artifacts
  → remove private maps

FROM base AS runner
COPY injected standalone output from bugsink-symbolication
COPY injected static output from bugsink-symbolication
```

The runner must never copy JavaScript from the pre-injection `builder` stage when automatic source maps are active.

The Prisma `migrator` stage must derive directly from `builder`, not from `bugsink-symbolication`, so the second `--target migrator` build cannot upload again.

### 8.2 CLI installation

Do not rely on unpinned `npx sentry-cli`, because it may download a new package during a production deploy and makes builds dependent on registry availability and mutable upstream versions.

Preferred choices, in order:

1. Copy a pinned `sentry-cli` binary from a pinned official image stage after verifying binary path and Alpine compatibility.
2. Install a pinned `@sentry/cli` package in a dedicated tools stage and copy only the required binary/runtime into the symbolication stage.
3. Require a pinned application dependency only for the custom-Dockerfile contract, not for managed templates.

The selected CLI version must be covered by an integration test against the deployed Bugsink major/minimum version.

### 8.3 Secret mount

The upload command must read the token from a BuildKit secret mount:

```Dockerfile
RUN --mount=type=secret,id=bugsink_auth_token,required=true \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/bugsink_auth_token)" \
    sentry-cli ...
```

This snippet is conceptual. The final command must:

- Work under Alpine `/bin/sh`.
- Avoid `set -x`.
- Avoid printing the token.
- Avoid persisting the token in a shell profile or filesystem layer.
- Validate the non-secret URL and slug before interpolation.
- Fail on injection or upload failure.

Non-secret configuration can be passed as validated build arguments, but values should still use argument-array process execution at the Docker invocation boundary.

### 8.4 Conditional behavior

There are two reasonable managed-template designs:

**Preferred:** one template with a runner source stage selected by an explicit build target/argument generated by Port-Au-Next. The automatic path requires the secret; the ordinary path never references it.

**Alternative:** separate generated templates/marker flags for source maps on and off.

The preferred design reduces template combinations, but it must be proven not to require a missing secret in the disabled path. Bugsink-disabled builds must not receive `--secret`, and no upload stage may execute.

### 8.5 Map deletion

After a successful upload:

- Delete client `.map` files from `.next/static` before the runner copies it.
- Delete other maps not required at runtime after their successful upload.
- Never delete or rewrite the injected JavaScript after upload.
- Verify no browser maps exist in the final runner image.

Do not set `productionBrowserSourceMaps: true` and leave maps under `/_next/static`. The purpose of generation is private artifact upload, not public source distribution.

---

## 9. Application-side Next.js contract

Port-Au-Next can securely upload maps only if the application emits them.

For applications using `@sentry/nextjs`, the application must not unconditionally set:

```ts
sourcemaps: { disable: true }
```

The platform should inject this non-secret build flag into eligible builds:

```text
PORT_AU_NEXT_BUGSINK_SOURCEMAPS=1
```

Documentation should show an application-controlled configuration patterned like:

```ts
const platformUploadsSourceMaps =
  process.env.PORT_AU_NEXT_BUGSINK_SOURCEMAPS === '1';

export default withSentryConfig(nextConfig, {
  sourcemaps: {
    disable: !platformUploadsSourceMaps,
    deleteSourcemapsAfterUpload: false,
  },
  telemetry: false,
  silent: true,
});
```

The exact option names and supported `@sentry/nextjs` versions must be verified before publishing this snippet. Port-Au-Next performs the manual CLI upload, so maps must remain available until its post-build upload step.

For plain Next.js applications without `@sentry/nextjs`, investigate whether the platform's Next.js adapter can enable private source-map production safely for supported Next.js versions. If doing so requires extending `modifyNextConfig`, add focused parser/fixture tests for every supported export form. Do not silently claim support merely because a project depends on `next`.

If automatic mode is selected but no useful maps are produced, fail with an actionable error such as:

```text
Bugsink source-map upload is enabled, but the Next.js build emitted no usable
source maps. Ensure source-map generation is enabled and maps retain sourcesContent.
```

---

## 10. Custom Dockerfile contract

### 10.1 Phase-one behavior

For a Dockerfile without the Port-Au-Next generated marker:

- Do not modify it.
- Do not pass the global Bugsink API token.
- Continue injecting the runtime DSN as today.
- Report source maps as `application-managed`.
- Show documentation for manual Bugsink upload.
- Log a visible deployment warning when source-map automation was requested but cannot be provided.

This preserves compatibility and avoids turning a normal Bugsink deployment into a failure solely because the app owns its build.

### 10.2 Future opt-in contract

A later phase may recognize an explicit source directive, for example:

```Dockerfile
# port-au-next: bugsink-sourcemaps=v1
```

The contract would define:

- Required BuildKit secret ID: `bugsink_auth_token`.
- Non-secret build args or environment values for Bugsink URL and project slug.
- Required behavior: build, inject, upload, remove maps, and deploy injected JS.
- Required failure behavior.
- A result label recording declared integration version.

This marker proves intent, not safety. With the current global token, a custom Dockerfile can still exfiltrate the secret. Custom opt-in should therefore remain disabled unless one of these becomes true:

1. Bugsink supports an upload-only, project-scoped token.
2. Port-Au-Next provides a trusted upload broker that never exposes the global token to the application build.
3. The administrator explicitly opts into trusting custom Dockerfiles with the global credential.

An image label can record that a Dockerfile declares support, but cannot prove that uploaded artifacts match the final image. End-to-end validation remains necessary.

---

## 11. Credential and security design

### 11.1 Values and lifetimes

| Value | Secret | Scope | Lifetime/location |
|---|---:|---|---|
| `SENTRY_DSN` | Treat as sensitive | Per app | Build/runtime application env, existing behavior |
| `NEXT_PUBLIC_SENTRY_DSN` | Public ingestion identifier | Per app | Client build/runtime, existing behavior |
| Bugsink base URL | No | Platform | Validated build configuration |
| Bugsink project slug | No | Per app | Validated build configuration |
| Bugsink API/upload token | Yes, privileged | Platform-wide today | Deployment-manager memory → temporary file → one BuildKit secret mount |
| `PORT_AU_NEXT_BUGSINK_SOURCEMAPS` | No | Per build | Builder only; should not be required at runtime |

### 11.2 Temporary secret file

The builder should:

1. Resolve the token through `requireBugsinkApiToken()`.
2. Create a unique directory with mode `0700` under an approved temporary root.
3. Write the token file with mode `0600` without logging its content.
4. Register the token with active log redaction before starting Docker.
5. Pass the file using `--secret id=bugsink_auth_token,src=<absolute path>`.
6. Delete the file and directory in `finally`, whether the build succeeds or fails.
7. Clear the temporary redaction context after all related logging completes.

The token file must not be created inside the application build context.

### 11.3 URL choice and connectivity

Deployment-manager calls Bugsink internally at `http://bugsink:8000`, but Docker build steps are not automatically attached to `port_au_next_network`. The Compose service name may therefore be unresolvable inside BuildKit.

Phase one should use the public HTTPS URL derived from `BUGSINK_HOST`, subject to an integration test proving BuildKit can reach it. Do not add `--network host` merely to make internal routing work; that broadens build access and behaves differently across Docker Desktop and native Linux.

### 11.4 Logging

Build logs may contain file paths, artifact counts, debug IDs, HTTP statuses, and Bugsink response messages. They must not contain:

- Auth tokens.
- Authorization headers.
- Full DSNs containing credentials.
- Application source content from uploaded maps.

`redactLogText` should include the resolved database token during the build. Add explicit patterns for any CLI formatting that could echo auth configuration. Do not run the CLI with debug logging by default; make debug logging an operator-controlled troubleshooting mode whose output is still redacted.

### 11.5 Tenant isolation

Before upload, verify that the project slug was loaded from `getBugsinkAppCredentials(app.id)` for the same app whose project directory is being built. Never accept a source-map project slug from application-owned environment variables.

The upload log should record app ID, deployment ID, and project slug, but not the token or DSN.

---

## 12. Build invocation changes

Extend `BuildImageOptions` with a source-map plan rather than loose secret strings:

```ts
interface BuildImageOptions {
  target?: string;
  imageTag?: string;
  deploymentId?: number;
  buildVariant?: 'build' | 'build-migrate';
  projectDir?: string;
  sourceMaps?: AutomaticSourceMapBuildOptions;
}
```

`buildReleaseImages` should pass source-map options only to the default runner build:

```text
buildImage(default runner, sourceMaps=automatic)
buildImage(target=migrator, sourceMaps=undefined)
```

The Docker command should be executed as an executable plus argument array. Conceptually:

```text
docker build
  --secret id=bugsink_auth_token,src=/tmp/.../token
  --build-arg PORT_AU_NEXT_BUGSINK_SOURCEMAPS=1
  --build-arg BUGSINK_URL=https://...
  --build-arg BUGSINK_PROJECT_SLUG=...
  -t app:version
  -f /absolute/Dockerfile
  /absolute/projectDir
```

This is a conceptual interface, not authorization to put unchecked strings into shell commands. Validate:

- URL protocol and hostname.
- Project slug format or safe opaque-argument handling.
- Image tag and target values.
- Absolute paths and project containment.

Capture stdout/stderr directly to the existing build log without shell `&>` redirection.

---

## 13. Failure policy and deployment reporting

### 13.1 Automatic mode

The following failures should fail the build and therefore the deployment:

- No maps were generated.
- Maps lack required `sourcesContent`.
- Debug-ID injection fails.
- Expected deployed JavaScript has no injected debug ID.
- Bugsink upload fails after bounded retries.
- Cleanup fails in a way that would publicly expose maps.
- Final runner verification finds public browser maps.

The existing async deployment wrapper in `actions.ts` already catches release-pipeline failures and marks the deployment `failed`. No new terminal deployment status is required initially.

### 13.2 Retry policy

Upload retries may reuse the exact artifacts in the current symbolication stage. Do not rerun `next build` between retries.

Suggested policy:

- Maximum three upload attempts.
- Short exponential backoff.
- Retry network failures and server `5xx` responses.
- Do not retry authentication, invalid-project, malformed-artifact, or other deterministic `4xx` failures.

Because Dockerfile `RUN` logic is a poor place for nuanced HTTP classification, phase one may perform one CLI attempt and fail. Add retries only after capturing real failure output and proving token-safe logging.

### 13.3 Visible phases

Keep deployment status as `building`, but add structured deployment log entries:

```text
Phase: build — Next.js build complete
Phase: source-maps — validating artifacts
Phase: source-maps — injecting debug IDs
Phase: source-maps — uploading artifact bundle
Phase: source-maps — upload complete
Phase: source-maps — private maps removed
```

If source maps are application-managed, emit one warning near the start of the build rather than burying it in raw Docker output.

---

## 14. Generated Dockerfile migration

1. Increment `GENERATED_DOCKERFILE_VERSION` from `6` to the next version.
2. Update both managed templates with the same source-map stage contract.
3. Preserve the `uses_prisma` marker flag.
4. Ensure `shouldRegenerateGeneratedDockerfile` regenerates older managed files on the next deploy.
5. Never regenerate a Dockerfile lacking a valid Port-Au-Next marker.
6. Log that regeneration occurred and whether the source-map path is active, without logging secret values.

If source-map automation is configurable per app, avoid encoding its enabled state into the generated Dockerfile contents unless necessary. Prefer a stable template whose build path is selected by the platform so toggling Bugsink does not repeatedly rewrite the Dockerfile.

---

## 15. Proof of concept

The full production design above addresses long-term concerns that are unnecessary for the first experiment. This work is happening on a development branch and will be tested locally by rebuilding Docker images. The branch and local Docker environment are the experiment boundary; the POC needs no feature flag, environment-variable activation, app allowlist, database setting, API, or UI.

The POC has one purpose:

> Prove that both current Port-Au-Next-generated Next.js Dockerfile variants—including the Prisma variant—can upload matching browser source maps to Bugsink and deploy the exact debug-ID-injected client bundles.

The POC is branch-local implementation work, not a separately activated product feature.

### 15.1 POC scope

The POC supports only:

- Production/default-branch deployments with Bugsink enabled.
- Both `buildNextDockerfile` and `buildPrismaDockerfile`.
- Port-Au-Next-managed Next.js Dockerfiles, including Prisma-enabled apps.
- Browser artifacts under `.next/static`.
- An application already using `@sentry/nextjs`.
- The application's existing Bugsink project and project slug.
- The existing global `BUGSINK_API_TOKEN` as a BuildKit secret.
- The public HTTPS Bugsink URL derived from `BUGSINK_HOST`.
- A pinned `sentry-cli` version.
- Fail-the-build behavior when validation, injection, or upload fails.

The POC explicitly excludes:

- Application-owned Dockerfiles.
- Preview branches.
- Server and edge source maps.
- Plain Next.js applications without `@sentry/nextjs`.
- Automatic framework detection beyond validating the selected app.
- New database tables, `app_features`, migrations, or settings UI.
- Framework adapter and generic uploader abstractions.
- Upload retries.
- Project-scoped token provisioning.

There is deliberately no POC activation mechanism. On this branch, a production deployment using a managed Dockerfile uploads source maps whenever Bugsink credentials are present. A Bugsink-disabled app follows the existing build path without a secret or upload.

### 15.2 Why Prisma is not a blocker

Prisma does not affect Next.js source-map generation or Bugsink upload. The only complication is that `buildReleaseImages` currently runs two Docker builds when automatic migration is enabled:

1. A normal/default build for the application runner.
2. A second build with `--target migrator` for the migration image.

The POC passes the source-map arguments and BuildKit secret only to the runner build. Both generated Dockerfiles branch into a dedicated `source-map-publisher` stage after the application build. The Prisma `migrator` stage branches directly from `builder`, so a targeted migrator build cannot reach the publisher stage or receive the upload token. BuildKit should reuse the expensive application build layers where possible.

```text
runner docker build
  → npm run build
  → source-map-publisher validates the pinned CLI
  → inject + upload + delete browser maps
  → runner copies browser assets from source-map-publisher

migrator docker build --target migrator
  → npm run build layer is normally cached
  → build stops at migrator; source-map-publisher is unreachable
  → migrator image is produced normally
```

The key POC assertion is that the combined runner and migrator logs contain exactly one upload.

### 15.3 Required cooperating application configuration

The selected application must use `withSentryConfig` and expose an explicit `sourcemaps` block. During a managed Bugsink build, Port-Au-Next rewrites the build copy to use native Next.js browser source maps and disables Sentry's competing build-time source-map processing:

```ts
const nextConfig = {
  productionBrowserSourceMaps: true,
};

export default withSentryConfig(nextConfig, {
  sourcemaps: {
    disable: true,
    deleteSourcemapsAfterUpload: false,
  },
  telemetry: false,
  silent: true,
});
```

The rewrite applies only to the deployment worktree and is performed only when a managed production build has Bugsink credentials. It does not add the future `PORT_AU_NEXT_BUGSINK_SOURCEMAPS` contract.

If `@sentry/nextjs` attempts its own upload because a token or organization setting is present in the application, disable that automatic upload. Port-Au-Next is the authoritative final artifact processor: the publisher always runs the pinned CLI injection immediately before uploading the exact browser artifacts that will be copied into the runtime image. It does not infer injection state from JavaScript source text.

### 15.4 Simplified build flow

For a production deployment:

```text
runReleasePipeline
  → resolve Bugsink app credentials
  → if Bugsink is disabled: build normally
  → if Bugsink is enabled:
    → resolve the platform API token
    → create a temporary secret file outside the build context
    → default docker build receives URL, slug, enable argument, and secret
      → npm run build
      → install and execute the pinned sentry-cli in the publisher stage
      → inject Debug IDs into the final browser artifacts
      → sentry-cli sourcemaps upload .next/static
      → delete .next/static/**/*.map
      → copy injected .next/static into runner
    → delete the temporary secret file
  → if Prisma auto-migrate is enabled:
    → docker build --target migrator without source-map inputs
  → continue normal green-container deployment
```

The existing traffic model already provides a useful failure boundary: a Docker build failure occurs before the green container starts, so the currently active deployment remains routed.

### 15.5 Minimal code changes

The POC should modify only these areas:

| File | POC responsibility |
|---|---|
| `deployment-manager/src/services/releasePipeline.ts` or `docker.ts` | Resolve Bugsink inputs for a production managed build |
| `deployment-manager/src/services/docker.ts` | Pass optional arguments and a temporary BuildKit secret to the runner build; omit them from the migrator build |
| `deployment-manager/src/services/generatedDockerfileTemplates.ts` | Add the same conditional browser inject/upload/delete step to both managed templates |
| `deployment-manager/src/utils/generatedDockerfileMarker.ts` | Bump the managed Dockerfile version so the selected managed file is regenerated |
| `deployment-manager/src/lib/redactLogs.ts` or build-scoped caller | Ensure the resolved database token is redacted from build failures |

The POC should reuse:

- `getBugsinkAppCredentials(app.id)` from `bugsink.ts` for the project slug.
- `requireBugsinkApiToken()` from `bugsinkToken.ts` for the upload credential.
- `BUGSINK_HOST` for the public URL.
- The existing per-deployment build log and failed-deployment handling.

No new source-map module, capability interface, UI component, API route, database record, Compose variable, or `.env.example` setting is required.

### 15.6 Minimal build options

For the POC, `BuildImageOptions` can accept one optional grouped object:

```ts
interface BugsinkSourceMapBuild {
  url: string;
  projectSlug: string;
  authToken: string;
}

interface BuildImageOptions {
  // existing properties
  bugsinkSourceMaps?: BugsinkSourceMapBuild;
}
```

Keep these values grouped so the token cannot be confused with ordinary application environment. `buildReleaseImages` passes the object only to the default runner `buildImage` call and explicitly omits it from the `target: 'migrator'` call.

The implementation may retain the existing shell-based `execCommand` temporarily, provided that:

- The token value never appears in the command string.
- The temporary path is generated by the platform and safely quoted.
- URL and project slug are platform-resolved, validated, and safely quoted.
- The token is supplied only using `--secret`.
- Cleanup is guaranteed in `finally`.

Migration to argument-array process execution remains required before general rollout.

### 15.7 Generated Dockerfile step

Both generated templates participate. Each gets a dedicated publisher stage after `npm run build`; the runtime copies `.next/static` from this stage:

```Dockerfile
ARG BUGSINK_SOURCEMAPS=false
ARG BUGSINK_URL
ARG BUGSINK_PROJECT_SLUG

FROM builder AS source-map-publisher

RUN --mount=type=secret,id=bugsink_auth_token,required=false \
    if [ "$BUGSINK_SOURCEMAPS" = "true" ]; then \
      test -s /run/secrets/bugsink_auth_token && \
      npm install --global @sentry/cli@2.58.6 && \
      sentry-cli --version && \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/bugsink_auth_token)" && \
      sentry-cli sourcemaps inject .next/static && \
      sentry-cli --url "$BUGSINK_URL" sourcemaps \
        --org bugsinkhasnoorgs \
        --project "$BUGSINK_PROJECT_SLUG" \
        upload .next/static && \
      find .next/static -type f -name '*.map' -delete; \
    fi
```

This is conceptual syntax, not the final patch. Before implementation, verify:

- How the pinned CLI is installed and invoked on Alpine.
- Whether the chosen CLI expects `--url` before or after the subcommand.
- That `.next/static` contains both matching browser JS and maps.
- That maps contain `sourcesContent`.
- That `inject` modifies the exact files copied by the existing runner instruction.
- That source-map deletion does not remove a runtime-required asset.

With no enable argument, the step does nothing. A Bugsink-enabled runner build receives the enable argument and secret. The Prisma migrator derives directly from `builder` and never reaches this stage. The runner copies the processed browser assets from `source-map-publisher`; the CLI and token are never copied into the runtime image.

### 15.8 Secret handling for the POC

The POC may use the existing global token because the participating Dockerfile is platform-managed. It must still observe these minimum controls:

1. Resolve the token only for a production, managed-Dockerfile build with Bugsink credentials.
2. Create the token file outside the selected application's build context.
3. Use a unique temporary directory with mode `0700` and token file mode `0600`.
4. Register the exact resolved token with log redaction for the duration of the build.
5. Pass only the temporary filename to `docker build --secret`.
6. Never add `SENTRY_AUTH_TOKEN` to `appEnv`, `.env`, Docker `ARG`, or Docker `ENV`.
7. Remove the token file and temporary directory in `finally`.
8. Inspect the final image to confirm that neither the token nor `/run/secrets/bugsink_auth_token` exists.

The POC must never pass the token to an unmarked/custom Dockerfile.

### 15.9 POC failure policy

Once a managed production build has Bugsink enabled, any of these conditions fails that deployment:

- Bugsink URL, project slug, or API token is unavailable.
- `.next/static` has no expected browser maps.
- A map lacks useful embedded sources.
- Debug-ID injection fails.
- No injected debug ID can be found afterward.
- Artifact upload fails.
- Map deletion fails.

A Bugsink-disabled app builds normally. A custom Dockerfile remains outside the POC, builds according to its existing behavior, and receives no upload secret.

No upload retry is required in the POC. One deterministic build and one upload make it easier to prove which artifacts were deployed. The existing release pipeline should mark the deployment failed and leave existing traffic unchanged.

### 15.10 POC execution and validation sequence

Run the experiment in this order:

1. Confirm the local Bugsink version supports the documented CLI flow.
2. Confirm the chosen app uses a managed Prisma Dockerfile and has Bugsink enabled.
3. Configure its installed `@sentry/nextjs` version to retain source maps.
4. Rebuild the deployment-manager image from this branch.
5. Redeploy the application normally through Port-Au-Next.
6. Confirm the runner build log shows one successful injection and upload.
7. Confirm the later `--target migrator` build shows no upload.
8. Inspect the runner image: client JS contains debug IDs and `.next/static` contains no maps.
9. Confirm source-map URLs are unavailable publicly.
10. Trigger a new client exception from a known TypeScript/React line.
11. Confirm Bugsink displays the original filename, line, and source context.
12. Repeat after a small client change to prove the next build uploads and matches its own artifacts.

### 15.11 POC acceptance criteria

The POC is successful only when all criteria pass:

1. A managed Prisma-enabled app completes both runner and migrator builds.
2. The runner build uploads source maps exactly once.
3. The migrator build performs no upload and receives no token secret.
4. The runner uses injected browser JavaScript from that exact build.
5. Browser maps are absent from the image and are not publicly served.
6. A new browser exception resolves to its original source filename and line/context.
7. The token is absent from image layers, runtime configuration, and logs.
8. A Bugsink-disabled managed app builds without source-map inputs.
9. Custom Dockerfiles never receive the upload token.

### 15.12 Evidence to retain

Record the following in the POC result section or a follow-up document:

- Selected app and deployment ID.
- Next.js, `@sentry/nextjs`, Bugsink, and `sentry-cli` versions.
- Confirmed inject/upload target paths.
- Representative injected debug ID, which is not secret.
- Confirmation that the same ID exists in the deployed chunk and uploaded artifact.
- Final-image `.map` search result.
- HTTP result for an attempted public map request.
- Screenshot or issue reference showing original source symbolication.
- Sanitized negative-test log.
- Any unsupported server/edge observations, clearly labeled as outside POC scope.

### 15.13 Promotion from POC to production feature

Promote the branch-local POC into the production design only after:

- Two builds with different client artifacts both symbolicate correctly.
- Token and map leakage checks pass.
- Failure behavior preserves the existing active deployment.
- The CLI and target paths are pinned by automated fixture tests.
- The Prisma runner uploads once and its migrator build skips upload.
- Managed/custom capability reporting is added.
- Shell-based Docker invocation is replaced or fully hardened.
- The application build-flag contract is documented and version-tested.

At that point, replace the minimal grouped build option with the `DeploymentSourceMapPlan` described in §7 if the broader capability model is still justified by what the POC reveals.

---

## 16. Implementation phases

### Phase 0 — empirical spike

- [ ] Pin a representative supported Next.js and `@sentry/nextjs` version.
- [ ] Build a minimal standalone fixture with one known browser exception and one known server exception.
- [ ] Inventory emitted JS/map locations and `sourcesContent`.
- [ ] Identify which files are actually copied into `.next/standalone` and `.next/static`.
- [ ] Run `sentry-cli inject` against candidate targets.
- [ ] Confirm the deployed client and server JS retain debug IDs.
- [ ] Upload to a test Bugsink project and verify symbolication.
- [ ] Confirm browser maps return `404` after runtime packaging.
- [ ] Verify the chosen pinned CLI against the deployed Bugsink image/version.

**Exit criterion:** exact target directories and supported Next.js/Sentry configuration are evidence-based.

### Phase 1 — source-map planning and capability detection

- [ ] Add source-map feature types/configuration.
- [ ] Add managed-versus-custom Dockerfile detection as a reusable result from `ensureDockerfile`.
- [ ] Add the initial Next.js framework adapter.
- [ ] Resolve an explicit `DeploymentSourceMapPlan` before building.
- [ ] Keep previews and Bugsink-disabled apps in `off` mode.
- [ ] Add clear structured logs for chosen mode and reason.

### Phase 2 — secure Docker build secrets

- [ ] Add argument-array Docker execution.
- [ ] Add BuildKit secret support to `buildImage`.
- [ ] Add restrictive temporary-file creation and guaranteed cleanup.
- [ ] Add the resolved database token to build-scoped redaction.
- [ ] Confirm build logs and thrown errors contain no credential.
- [ ] Ensure migrator builds receive no secret.

### Phase 3 — managed Dockerfile symbolication stages

- [ ] Add a pinned CLI tools stage.
- [ ] Add runner-only source-map verification, injection, upload, and cleanup.
- [ ] Ensure Prisma `migrator` bypasses upload.
- [ ] Copy runtime assets only from the injected stage.
- [ ] Increment the generated Dockerfile version.
- [ ] Verify disabled builds execute no source-map stage and require no secret.

### Phase 4 — UI and application contract

- [ ] Extend Error Tracking settings with source-map capability/status.
- [ ] Document `PORT_AU_NEXT_BUGSINK_SOURCEMAPS`.
- [ ] Publish verified `@sentry/nextjs` configuration examples.
- [ ] Explain why `sourcemaps.disable: true` prevents automation.
- [ ] Show an actionable custom-Dockerfile message.
- [ ] Explain the fail-on-upload policy.

### Phase 5 — end-to-end verification and rollout

- [ ] Run browser and server fixture tests against an actual Bugsink instance.
- [ ] Test Bugsink-disabled, managed, Prisma-managed, and custom Dockerfile paths.
- [ ] Test network and authentication failures.
- [ ] Inspect final images for token and `.map` leakage.
- [ ] Roll out to one non-critical application.
- [ ] Verify new events symbolicate before enabling automatic mode broadly.

### Future phase — trusted custom Dockerfile integration

- [ ] Determine whether project-scoped upload credentials are available.
- [ ] Define and version the Dockerfile opt-in contract.
- [ ] Add administrator trust policy if a global token remains necessary.
- [ ] Add Vite or other framework adapters independently of the Bugsink uploader.

---

## 17. Acceptance criteria

### 17.1 Bugsink disabled

1. No source-map build flag is injected.
2. No upload token is resolved or written to disk.
3. No Docker `--secret` argument is supplied.
4. No symbolication/upload stage executes.
5. Existing runner output and deployment behavior remain unchanged.

### 17.2 Managed Next.js Dockerfile

1. Next.js build completes before validation or injection.
2. Useful source maps exist and include `sourcesContent`.
3. Injection completes before upload.
4. Upload completes before map deletion.
5. The runner copies injected JavaScript, not pre-injection JavaScript.
6. The uploaded artifact debug IDs match those found in deployed chunks.
7. Browser `.map` files are absent from the final image and unavailable over `/_next/static`.
8. The runtime image contains no upload token or CLI unless independently required.
9. Runtime receives only the normal Bugsink/Sentry SDK environment values.

### 17.3 Prisma-managed Dockerfile

1. The default runner build uploads once.
2. The subsequent `--target migrator` build does not upload.
3. The migrator image contains no upload token or unrelated source-map artifacts.
4. The runner still contains the exact injected application bundles.

### 17.4 Upload failure

1. Deployment becomes `failed` before green-container startup.
2. Existing active traffic remains unchanged.
3. The error is visible in deployment logs.
4. No token or DSN credential appears in logs.
5. A retry, if supported, reuses the exact build output and does not rebuild.

### 17.5 Custom Dockerfile

1. The Dockerfile is not modified.
2. The global Bugsink token is not supplied.
3. Runtime DSN injection continues unchanged.
4. UI and deployment logs state that source maps are application-managed.
5. Documentation provides the explicit manual integration requirements.

### 17.6 End-to-end symbolication

1. Trigger a new browser exception from a known TypeScript/React source line.
2. Bugsink shows the original filename, line, and source context.
3. The served chunk contains the debug ID associated with the uploaded bundle.
4. Its source map is not publicly downloadable.
5. Trigger a server-side exception and verify symbolication where supported.
6. Document any server/edge limitations instead of treating browser success as proof of all runtimes.

---

## 18. Focused test plan

| Test | Level | Expected result |
|---|---|---|
| Source-map plan with Bugsink disabled | Unit | `mode: off`; token resolver is not called |
| Managed-marker detection | Unit | Managed template is eligible |
| Unmarked Dockerfile detection | Unit | `application-managed`; secret is withheld |
| Preview branch plan | Unit | `mode: off` |
| Docker argument construction | Unit | `--secret` appears only in automatic runner builds; token value never appears |
| Temporary secret lifecycle | Unit/integration | Mode `0600`; file removed on success and failure |
| Redaction | Unit | Token, Bearer header, and credential-bearing DSN are redacted |
| Generated standard template ordering | Snapshot/string assertions | Build → inject → upload → delete → runner copy |
| Generated Prisma stage graph | Snapshot/build | Migrator target bypasses upload |
| Missing maps | Image-build integration | Build fails with actionable message |
| Missing `sourcesContent` | Image-build integration | Build fails before upload |
| Upload authentication failure | Integration | Deployment fails; sanitized error shown |
| Public map cleanup | Container/HTTP integration | No `.map` in runner static tree; URL returns `404` |
| Debug-ID preservation | Container inspection | Deployed JS contains injected debug ID |
| Exact artifact match | Bugsink E2E | New event resolves to original source |
| Second build of migrator | Build-log assertion | Only one source-map upload invocation |
| Multiple deployments | Bugsink E2E | Each deployment's event matches its own artifact bundle |

Tests around Dockerfile templates should assert semantic stage relationships, not only one large brittle snapshot. A fixture build remains necessary because textual ordering alone cannot prove that runtime copies originate from the injected stage.

---

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Global Bugsink token is exposed to application code | Supply it only to a platform-controlled stage via BuildKit secret; do not support custom Dockerfiles initially. |
| BuildKit cannot resolve `bugsink:8000` | Use and test the public HTTPS Bugsink URL; do not assume Compose DNS during builds. |
| Wrong `.next` copy is injected | Establish exact output paths with a fixture and verify debug IDs inside the final runner image. |
| Upload runs twice for Prisma apps | Put symbolication on the runner-only stage branch; migrator derives directly from builder. |
| App explicitly disables maps | Validate output and fail with a configuration-specific message; document the build flag contract. |
| `npx` downloads a mutable CLI | Pin and provide the CLI through a controlled tools stage. |
| Maps are accidentally public | Delete before runner copy and inspect/HTTP-test the final image. |
| Token leaks through build output | Avoid command-line token values, disable shell tracing, add build-scoped redaction, and test failure logs. |
| Source-map upload endpoint behavior changes | Pin compatible Bugsink/CLI versions and retain an end-to-end compatibility test. |
| Generated Dockerfiles are not refreshed | Increment the managed marker version. |
| Broad `.next` upload is slow or oversized | Upload only verified deployed artifact directories. |
| Custom Dockerfile silently lacks symbolication | Display `application-managed` status and an actionable warning. |
| Existing `.env` handling broadens secret exposure | Never place upload credentials in `appEnv`; separately audit `.env`/build-context handling. |

---

## 20. Operational verification checklist

Before declaring a deployment source-map-capable:

- [ ] Bugsink reports a compatible version (minimum 2.0.14 for the documented flow).
- [ ] The selected `sentry-cli` version successfully uploads to the actual Bugsink instance.
- [ ] The application build emits maps with `sourcesContent`.
- [ ] Injection modifies the JS that the runner ultimately serves/executes.
- [ ] Upload succeeds for the app's platform-resolved project slug.
- [ ] Final client chunks contain debug IDs.
- [ ] Final server bundles contain debug IDs where server maps are supported.
- [ ] Final image contains no upload token.
- [ ] Final public static tree contains no `.map` files.
- [ ] A newly generated browser event resolves to original source.
- [ ] A newly generated server event is tested and its support level documented.
- [ ] Existing active deployment remains untouched when a source-map-enabled build fails.

---

## 21. Open decisions requiring empirical confirmation

1. Which exact `@sentry/nextjs` versions and option names Port-Au-Next will document.
2. Whether plain Next.js applications can be supported automatically without fragile config rewriting.
3. Exact client and server target directories for standalone output across supported Next.js versions.
4. Whether standalone output duplicates server files in a way that requires injection before or after tracing/copying.
5. Which pinned `sentry-cli` distribution works cleanly in the Alpine builder.
6. Whether the public Bugsink hostname is reliably reachable from Docker BuildKit on all supported hosts.
7. Whether Bugsink offers or plans project-scoped/upload-only tokens; this determines the future custom-Dockerfile security model.
8. Whether server and edge events produced by supported Sentry SDK versions reliably include injected debug IDs.
9. Whether automatic source maps default on with Bugsink or require an explicit settings toggle. The safer rollout is explicit opt-in until the fixture/E2E matrix is stable.

None of these questions should be answered by silently expanding the upload target to all of `.next` or by exposing the global token more broadly.

---

## 22. Repository change map

The eventual implementation is expected to touch or add the following areas:

| Area | Current responsibility | Proposed change |
|---|---|---|
| `deployment-manager/src/services/bugsink.ts` | Per-app project/DSN resolution | Expose a narrowly typed source-map project descriptor |
| `deployment-manager/src/services/bugsinkToken.ts` | Global token bootstrap/storage | Provide token to trusted build-secret preparation only |
| `deployment-manager/src/services/appEnv.ts` | Runtime/build application env merge | Add only non-secret adapter flag if eligible; never add upload token |
| `deployment-manager/src/services/docker.ts` | Dockerfile selection and image builds | Resolve managed/custom result, accept source-map plan, pass BuildKit secret safely |
| `deployment-manager/src/utils/docker.ts` | Shell-based Docker execution and redaction | Add argument-array execution and build-log streaming |
| `deployment-manager/src/services/generatedDockerfileTemplates.ts` | Managed Next.js/Prisma Dockerfiles | Add pinned tools and runner-only symbolication stages |
| `deployment-manager/src/utils/generatedDockerfileMarker.ts` | Managed template version/flags | Increment version; preserve Prisma semantics |
| `deployment-manager/src/services/releasePipeline.ts` | Green deployment orchestration | Resolve/log plan and pass it only to runner build |
| `deployment-manager/src/services/nextConfig.ts` | Standalone/image config mutation | Potential adapter-aware map generation only after fixture validation |
| `deployment-manager/src/lib/redactLogs.ts` | Log redaction | Cover build-scoped token and CLI error formats |
| `deployment-manager/src/types/appFeatures.ts` | Per-app deployment features | Add optional Bugsink source-map feature state |
| `deployment-manager/src/components/settings/ErrorTrackingCard.tsx` | Bugsink settings and SDK guidance | Show automation capability, state, warnings, and verified config contract |
| New `services/sourceMaps/*` | — | Framework adapter, Bugsink uploader, plan resolution, validation |
| New fixture/test resources | — | Managed Next.js browser/server symbolication test application |

---

## 23. Recommended first deliverable

The smallest responsible production deliverable is:

1. One supported Next.js fixture and version matrix.
2. Automatic uploads for production deployments using managed non-Prisma and Prisma Dockerfiles.
3. One pinned `sentry-cli` version.
4. Public Bugsink URL upload through a BuildKit secret.
5. Fail-on-error semantics.
6. Final-image verification for debug IDs, token absence, and map absence.
7. Error Tracking UI that distinguishes `automatic` from `application-managed`.
8. No custom-Dockerfile secret injection.

This delivers trustworthy browser symbolication without pretending that arbitrary JavaScript builds are uniform or weakening the current Bugsink credential boundary.

---

## 24. References

### Repository

- `deployment-manager/src/services/bugsink.ts`
- `deployment-manager/src/services/bugsinkToken.ts`
- `deployment-manager/src/services/bugsinkUser.ts`
- `deployment-manager/src/services/appEnv.ts`
- `deployment-manager/src/services/docker.ts`
- `deployment-manager/src/services/generatedDockerfileTemplates.ts`
- `deployment-manager/src/services/releasePipeline.ts`
- `deployment-manager/src/services/nextConfig.ts`
- `deployment-manager/src/utils/docker.ts`
- `deployment-manager/src/utils/generatedDockerfileMarker.ts`
- `deployment-manager/src/lib/redactLogs.ts`
- `deployment-manager/src/queries/platformServiceSecretsQuery.ts`
- `deployment-manager/src/queries/migrate.ts`
- `deployment-manager/src/types/appFeatures.ts`
- `deployment-manager/src/components/settings/ErrorTrackingCard.tsx`
- `docker-compose.yml`

### External

- [Bugsink: Setting up Sourcemaps](https://www.bugsink.com/docs/sourcemaps/)
- [Bugsink: Vite Integration Guide for Sourcemaps](https://www.bugsink.com/docs/vite-integration-guide/)
- [Sentry: Uploading Source Maps with Sentry CLI](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/)
- [Docker: Build secrets](https://docs.docker.com/build/building/secrets/)
