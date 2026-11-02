# CI and Release

This project ships with ready-to-use GitHub Actions for CI and release.

All workflows build the all-tools entry point (`src/index.moz.ts`) through `npm run build:moz`,
so the artifacts include the Mozilla-only modules (`prefs`, `privileged`, `launch`, `bidi`).
They also run the public build (`npm run build`, `dist/`) through `npm run build:all`, because the
integration tests load the browser-side `dist/snapshot.injected.global.js` from there;
`build:moz` writes `dist.moz/` only.

Workflows
- CI (.github/workflows/ci.yml)
  - Triggers on push (main, develop).
  - On pull requests, only runs when the `run-integration` label is applied. It is the
    only workflow that runs the integration suite, so it is opt-in per PR.
  - Matrix: Node 20 and 22.
  - Steps: install → lint → format check → typecheck → build (both entries) → test.
  - Optional: uploads coverage to Codecov if `coverage/lcov.info` exists and `CODECOV_TOKEN` is set.
  - Uploads the `dist.moz/` artifact (Node 20 job) for quick download.

- PR Check (.github/workflows/pr-check.yml)
  - Fast checks on PR open/update: lint, format check, typecheck.

- Release (.github/workflows/release.yml)
  - On tag push `v*` **only**. Pushes to branches never create a Release.
  - Fails unless the tag equals `v` + the `package.json` version.
  - Runs tests, builds both entries, renames `dist.moz/` to `dist/`, and creates a GitHub Release
    with a tarball of `dist` + metadata and the MCPB bundle.

What each workflow produces

| Trigger | Output | Where | Lifetime |
| --- | --- | --- | --- |
| push to `main`/`develop` | `dist.moz/` (all-tools build) | Actions run → Artifacts | 7 days |
| tag `v*` | `firefox-devtools-mcp-vX.Y.Z.tar.gz`, `firefox-devtools-mcp-X.Y.Z.mcpb` | GitHub Releases | until deleted |

Nothing is uploaded to npm or the MCP registry: the upstream package owns those names, so
`npx @mozilla/firefox-devtools-mcp` installs the upstream public build, not this one.

Secrets
- `CODECOV_TOKEN` (optional): used by Codecov upload step (CI). The step is skipped if the token or coverage file is missing.
- No publishing secret is needed: this fork does not publish packages.

Version control
- `package.json` is the single source of truth; the release tag must be `v` + that version.
- `npm version patch|minor|major -m "release: %s"` bumps it, runs `sync:manifests` (the `version`
  lifecycle script) and creates the tag in one step, carrying the new version into
  `plugin.json`, `gemini-extension.json`, `manifest.mcpb.json`, `server.json` and
  `package-lock.json`. Editing `package.json` by hand works too, then run
  `npm run sync:manifests`.

Release flow
1) Bump the version (keep 0.x until the API is stable) and update `CHANGELOG.md`.
2) Push the commit, then the tag: `git push origin main && git push origin v0.10.7`.
3) The release workflow verifies the tag against `package.json`, builds and publishes the
   GitHub Release. A failed check means the tag and the file disagree; delete the tag
   (`git push --delete origin vX.Y.Z`) and retry after fixing.

Client plugin manifests
- `plugins/*/.claude-plugin/` (Claude), `gemini-extension.json` (Gemini CLI) and the root
  `plugin.json` plus `mcp.json` (the Agent Plugins standard, which cursor.directory reads)
  let each client install the server from this repository. The root
  `.claude-plugin/marketplace.json` is the marketplace listing, not a plugin manifest.
- The Claude manifests and `mcp.json` carry no `version`. The others do, and `npm run sync:manifests`
  copies it from `package.json`, along with `manifest.mcpb.json`, `server.json` and the two
  version fields in `package-lock.json`. Since each manifest launches the server with `@latest`,
  the field is metadata only and does not pin what gets installed.

Notes
- The README documents only this fork's build: audit the source and build it, or install a
  release artifact. Upstream's `npx` instructions stay in the upstream README, linked from there.
- Each manifest still launches `npx @mozilla/firefox-devtools-mcp@latest`, which is the upstream
  public build; none of them launches this fork's all-tools build.

