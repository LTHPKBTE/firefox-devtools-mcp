# CI and Release

This project ships with ready-to-use GitHub Actions for CI and release.

All workflows build the all-tools entry point (`src/index.moz.ts`) through `npm run build:moz`,
so the artifacts include the Mozilla-only modules (`prefs`, `privileged`, `launch`, `bidi`).
The upstream public build (`npm run build`, `dist/`) is not used here.

Workflows
- CI (.github/workflows/ci.yml)
  - Triggers on push (main, develop).
  - On pull requests, only runs when the `run-integration` label is applied. It is the
    only workflow that runs the integration suite, so it is opt-in per PR.
  - Matrix: Node 20 and 22.
  - Steps: install → lint → format check → typecheck → test → build all-tools bundle.
  - Optional: uploads coverage to Codecov if `coverage/lcov.info` exists and `CODECOV_TOKEN` is set.
  - Uploads the `dist.moz/` artifact (Node 20 job) for quick download.

- PR Check (.github/workflows/pr-check.yml)
  - Fast checks on PR open/update: lint, format check, typecheck.

- Version Check (.github/workflows/version-check.yml)
  - On tag push `v*`: compares the tag version with `package.json`.
  - Fails if they differ (bump package.json before tagging).

- Release (.github/workflows/release.yml)
  - On tag push `v*`: runs tests, builds `dist.moz/`, renames it to `dist/`, and creates a GitHub
    Release with a tarball of `dist` + metadata and the MCPB bundle.

Secrets
- `CODECOV_TOKEN` (optional): used by Codecov upload step (CI). The step is skipped if the token or coverage file is missing.
- No publishing secret is needed: this fork does not publish packages.

Release flow
1) Bump version in `package.json` (keep 0.x until API is stable):
   - `npm version patch` (or minor), or edit `package.json` by hand
   - Run `npm run sync:manifests` to carry the version into the manifests that duplicate it
   - Update `CHANGELOG.md` and commit the change
2) Create and push the tag (must match package.json):
   - `git tag v0.2.0 && git push origin v0.2.0`
3) The `version-check` job validates the tag vs. package.json.
4) `release` creates a GitHub Release with the tarball and the MCPB bundle.

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
- Use `@latest` in README examples to encourage npx usage against the upstream package.

