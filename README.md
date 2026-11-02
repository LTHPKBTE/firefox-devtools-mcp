# Firefox DevTools MCP

English | [简体中文](README.zh-CN.md)

> **Not a Mozilla repository.** This fork
> ([LTHPKBTE/firefox-devtools-mcp](https://github.com/LTHPKBTE/firefox-devtools-mcp)) builds the
> all-tools variant of [mozilla/firefox-devtools-mcp](https://github.com/mozilla/firefox-devtools-mcp),
> which owns the upstream code, its releases and the `@mozilla/firefox-devtools-mcp` package.

Problems with a build from here — Release tarball, `.mcpb` bundle, CI artifact, local
`npm run build:moz` — go to
[this repository's issues](https://github.com/LTHPKBTE/firefox-devtools-mcp/issues), with the
build described. The upstream tracker takes only reports reproduced with the upstream package;
code changed here does not reproduce there.

[![CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)

MIT or Apache 2.0, at your option — see [License](#license).

MCP server that lets AI agents drive Firefox: browsing (read pages, fill forms, go through
multi-step flows) and web development (console, network requests, debugger, profiler). It
controls Firefox through WebDriver BiDi via Selenium WebDriver, and works with Claude Code,
Claude Desktop, Cursor, Cline and other MCP clients.

- Repository: https://github.com/LTHPKBTE/firefox-devtools-mcp
- Upstream: https://github.com/mozilla/firefox-devtools-mcp

Firefox must be installed locally; hosted services such as glama.ai cannot run this server.
Start at [Install](#install). The upstream public build, without the Mozilla-only modules, is
documented in the [upstream README](https://github.com/mozilla/firefox-devtools-mcp#readme).

## Security

The agent reaches what the browser reaches: cookies, saved logins, open sessions.

- Give it a profile that holds nothing you would not hand over. `--connect-existing` is the one
  case where your own session is the target; it gives the agent that same reach, and the
  trade-off is in [Connect to an existing Firefox](#connect-to-an-existing-firefox).
- Visit only sites you control or trust. Page content can carry instructions aimed at the agent
  (prompt injection).
- Expose only the modules you need. `basic` includes `evaluate_script`; `--tool-preset slim`
  removes it. `developer` (console, network, debugger, profiler) and `mozilla` (privileged
  context, preferences) widen it further.

[SECURITY.md](SECURITY.md) lists the risks per module and where to report a vulnerability.

## Requirements

- Node.js ≥ 20.19.0
- Firefox 100+, or 153+ for the `script` tools (`evaluate_script`, logpoints)
- Auto-detected on Windows; pass `--firefox-path` for another install

## Install

Build from source. The server drives your browser and `stealth` rewrites a file inside the
Firefox installation, so read `src/` before running it:

```bash
git clone https://github.com/LTHPKBTE/firefox-devtools-mcp
cd firefox-devtools-mcp
npm install
npm run build:moz
node dist.moz/index.js --auto-profile
```

Tests and the other scripts: [Build from source](#build-from-source).

### Prebuilt build

Not published to npm or the MCP registry; those names belong to upstream. Everything is built
by GitHub Actions:

- **[Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases)**, created from a `vX.Y.Z` tag:
  - `firefox-devtools-mcp-vX.Y.Z.tar.gz` — all tools, for any MCP client
  - `firefox-devtools-mcp-X.Y.Z.mcpb` — Claude Desktop extension, installed by double-click
- **Latest `main`** — Actions → [CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)
  → newest run → *Artifacts* → `dist.moz/`. Needs a GitHub account; deleted after 7 days.

From the tarball, which holds `dist/` plus `package.json`:

```bash
mkdir firefox-devtools-mcp
tar -xzf firefox-devtools-mcp-v0.10.7.tar.gz -C firefox-devtools-mcp
cd firefox-devtools-mcp
npm install --omit=dev
node dist/index.js --auto-profile             # the MCP server (stdio)
node dist/stealth-cli.js status               # optional: the binary patch command
```

Register it with that absolute path:

```bash
claude mcp add firefox-devtools node /absolute/path/to/firefox-devtools-mcp/dist/index.js -- --auto-profile
```

`dist/` also holds `snapshot.injected.global.js`, the browser-side script the snapshot tools
inject. `--tool-preset all` is the preset that exposes the `stealth` tools.

Commands below assume that layout (`dist/index.js`); a checkout built with `npm run build:moz`
writes `dist.moz/index.js`.

## Register the server with your client

The server speaks stdio, so any MCP client can run it. The client needs the absolute path to
`dist/index.js` (or `dist.moz/index.js` for a checkout you built yourself).

### Claude Code

```bash
claude mcp add firefox-devtools node /absolute/path/to/dist/index.js

# Headless + viewport via args
claude mcp add firefox-devtools node /absolute/path/to/dist/index.js -- --headless --viewport 1280x720

# Or via environment variables
claude mcp add firefox-devtools node /absolute/path/to/dist/index.js \
  --env START_URL=https://example.com \
  --env FIREFOX_HEADLESS=true
```

### Codex

```bash
codex mcp add firefox-devtools -- node /absolute/path/to/dist/index.js

# Headless + viewport via args
codex mcp add firefox-devtools -- \
  node /absolute/path/to/dist/index.js --headless --viewport 1280x720

# Or via environment variables
codex mcp add firefox-devtools \
  --env START_URL=https://example.com \
  --env FIREFOX_HEADLESS=true \
  -- node /absolute/path/to/dist/index.js
```

### Configuration file

Claude Code, in its `mcp_settings.json`:

```json
{
  "mcpServers": {
    "firefox-devtools": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js", "--headless", "--viewport", "1280x720"],
      "env": {
        "START_URL": "about:blank"
      }
    }
  }
}
```

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.firefox-devtools]
command = "node"
args = ["/absolute/path/to/dist/index.js", "--headless", "--viewport", "1280x720"]

[mcp_servers.firefox-devtools.env]
START_URL = "about:blank"
```

On Windows, write the path with forward slashes (`C:/tools/dist/index.js`) or escaped
backslashes.

`npm run setup` writes the same JSON to the right file for Claude Code, using the local build.

## Uninstall

No installer, service or global package: the server is a directory you extracted or built, and
the rest is under `~/.firefox-devtools-mcp` (`%USERPROFILE%\.firefox-devtools-mcp` on Windows).

**1. Undo the browser patch, if you applied it.** In an administrator shell, Firefox closed:

```bash
node dist/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox"
node dist/stealth-cli.js prune
```

`restore` copies the backup over the patched library, `prune` deletes backups of superseded
installs. The backup of the installed file is kept, because `restore` needs it; step 3 removes
it. Skip both if you never ran `patch`. After a browser update `status` reports `unrecognized`,
the vendor file is already in place, and there is nothing to restore.

**2. Remove the client entry.** `claude mcp remove firefox-devtools`, or delete the
`firefox-devtools` block from the JSON or TOML in
[Register the server with your client](#register-the-server-with-your-client). For the `.mcpb`
bundle, remove the extension in Claude Desktop's settings.

**3. Delete the files.** The extracted directory, and `~/.firefox-devtools-mcp`. That directory
holds the `--auto-profile` or `--profile-path` profile, `saveTo` output, captured Firefox logs,
and the stealth backups and records. Deleting it discards the logins that profile collected;
your own Firefox profile is not touched.

geckodriver comes from `PATH` or `~/.cache/selenium` — shared with other Selenium projects, so
usually best left — or from inside the extracted directory, which step 3 removes.

## Upstream package

`npx @mozilla/firefox-devtools-mcp@latest` and the client-specific install commands are
documented in the [upstream README](https://github.com/mozilla/firefox-devtools-mcp#readme).
That package is the public build, so its instructions do not apply here, and problems with it
belong upstream.

## Try it with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js --start-url https://example.com --headless
```

Then, for example: `list_pages`, `select_page`, `navigate_page`; `take_snapshot` followed by
`click_by_uid` or `fill_by_uid`; `list_network_requests`, `screenshot_page`,
`list_console_messages`.

## CLI options

Flags, with the environment variable in parentheses where one exists:

- `--firefox-path` — the browser executable, or the install directory holding it
- `--headless` — run without UI (`FIREFOX_HEADLESS=true`)
- `--viewport 1280x720` — initial window size
- `--profile-path` — use a specific Firefox profile. Firefox runs in a `firefox_devtools_mcp_profile` subfolder of that path, marked with a `.firefox-devtools-mcp` file; pointing `--profile-path` at a marked profile reuses it directly
- `--auto-profile` — reuse a persistent profile stored under `~/.firefox-devtools-mcp/`, so logins survive between runs. Scoped to the binary when `--firefox-path` is given (`AUTO_PROFILE=true`)
- `--firefox-arg` — extra Firefox arguments (repeatable)
- `--start-url` — open this URL on start (`START_URL`)
- `--accept-insecure-certs` — ignore TLS errors (`ACCEPT_INSECURE_CERTS=true`)
- `--connect-existing` — attach to an already-running Firefox instead of launching a new one (`CONNECT_EXISTING=true`). See [Connect to an existing Firefox](#connect-to-an-existing-firefox)
- `--marionette-port` — Marionette port for connect-existing mode, default 2828 (`MARIONETTE_PORT`)
- `--idle-timeout` — seconds without tool calls after which a connect-existing session releases Firefox, default 1800. Firefox accepts one client at a time, so other clients can only connect once it is released. The next tool call reconnects and selects the tab that is active in Firefox at that moment (`IDLE_TIMEOUT`)
- `--pref name=value` — set Firefox preference at startup via `moz:firefoxOptions` (repeatable). Not applied with `--connect-existing`, which does not launch the browser; set those prefs in `about:config` instead
- `--tool-preset` — select which tool modules to enable: `slim`, `basic` (default), `developer`, `mozilla`, or `all`. See [Tool modules and presets](#tool-modules-and-presets). (`TOOL_PRESET`)
- `--tools` — explicit list of tool modules to enable, overriding `--tool-preset` entirely (e.g. `--tools pages network script`). See [Tool modules and presets](#tool-modules-and-presets).
- `--enable-script` — _deprecated, use `--tool-preset developer` or `--tools ... script debugging`._ Selects the `developer` tool preset. (`ENABLE_SCRIPT=true`)
- `--enable-privileged-context` — _deprecated, use `--tool-preset mozilla` or `--tools ... privileged prefs`._  Selects the `mozilla` tool preset. Requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (`ENABLE_PRIVILEGED_CONTEXT=true`)
- `--android-device` — enable Firefox for Android mode; value is the ADB device serial (e.g. `emulator-5554`). Run `adb devices` to list connected devices. Omit the value or use `auto` to select the single connected device automatically.
- `--android-wipe-app-data` — confirm that Android mode wipes all data of the target app. Required together with `--android-device`. (`ANDROID_WIPE_APP_DATA=true`)
- `--android-package` — Android app package name, default `org.mozilla.firefox`. Other packages: `org.mozilla.firefox_beta` for Firefox Beta, `org.mozilla.fenix` for Firefox Nightly, `org.mozilla.fenix.debug` for Firefox Nightly Debug, `org.mozilla.geckoview_example` for geckoview (`ANDROID_PACKAGE`)
- `--unrestricted-save-paths` — let the `saveTo` parameter write anywhere on disk instead of the default roots. See [Saving bulky output to disk](#saving-bulky-output-to-disk) and the security note in [SECURITY.md](SECURITY.md). (`UNRESTRICTED_SAVE_PATHS=true`)
- `--log-file` — write MCP server logs to a file instead of stderr, for clients that hide
  server output. `DEBUG=*` adds debug logs. Example: `--log-file /tmp/firefox-mcp.log`

### Tool modules and presets

Tools are grouped into modules. You choose which modules to expose either with a named preset
(`--tool-preset`) or with an explicit list (`--tools`). When both are given, `--tools` wins and
the preset is ignored.

Presets (each is a superset of the previous):

- `slim` — the minimum to browse and interact with pages
- `basic` (default) — adds tools for regular browsing
- `developer` — adds tools for web developers
- `mozilla` — adds tools for Firefox developers
- `all` — every module

See [docs/tools.md](docs/tools.md#modules-and-presets) for the modules in each preset.

`basic`, the default, includes `script` and therefore `evaluate_script`;
[SECURITY.md](SECURITY.md#tool-modules-and-presets) covers what that adds to the attack
surface. Use `--tool-preset slim` or an explicit `--tools` list to drop it.

```bash
# developer preset: adds network, console, debugging and profiler tools
node dist/index.js --tool-preset developer

# only the modules you need
node dist/index.js --tools pages network console

# or keep that list in a file: ["pages", "network", "console"]
node dist/index.js --tool-preset ./my-tools.json
```

`--tool-preset` takes a built-in name or the path to a JSON file holding an array of module
names or `{ "modules": [...] }`.

Five modules need more than the default setup:

- `prefs`, `privileged` — require `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`.
- `launch` — `restart_firefox` relaunches the browser under a caller-chosen binary, profile,
  environment and preferences, so browser configuration becomes an agent-reachable capability.
  Set those on the command line instead (`--pref`, `--firefox-path`, `--profile-path`).
- `bidi` — sends any WebDriver BiDi command, so it reaches what the other modules expose.
- `stealth` — edits the installed browser binary, which needs elevation the server does not
  have. Not part of `mozilla`; run it as a separate command. Included in `all`. See
  [Hiding the WebDriver flag](#hiding-the-webdriver-flag-stealth-module).

This fork compiles all five in. The upstream public package drops them even when requested and
logs the names.

### Hiding the WebDriver flag (`stealth` module)

`navigator.webdriver` is answered in C++: `Navigator::Webdriver()` asks the remote agent and
Marionette whether automation is running, so no preference or page script changes it. The
`stealth` module overwrites that function's entry in the shared library (`xul.dll` on Windows,
`libxul.so` on Linux) with `xor eax, eax; ret`, so the property reads false while a session is
active. Measured on a real build: `true` → patch → `false` → restore → `true`, with the session
working throughout.

The write lands in the install directory, so it runs as a separate command from an
administrator shell; the server stays unprivileged:

```bash
# After `npm run build:moz` (the release tarball ships this file as dist/stealth-cli.js)
node dist.moz/stealth-cli.js status
node dist.moz/stealth-cli.js patch --firefox-path "C:\Program Files\Waterfox"
node dist.moz/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox"
node dist.moz/stealth-cli.js prune --dry-run   # then drop --dry-run
```

`--firefox-path` takes either the executable or the install directory holding it, and may come
before or after the command. Leave off a trailing backslash inside quotes, which PowerShell's
argument parsing swallows. Without the option the command looks for a detected **Firefox**
install on Windows: `Program Files`, the `firefox.exe` App Paths registry entries, or `PATH`.
Other builds — Waterfox, LibreWolf, a portable copy — are only found when you pass the path,
which is why the examples above do.

`status`, `patch` and `restore` also exist as MCP tools of the same names
(`get_stealth_status`, `patch_navigator_webdriver`, `restore_navigator_webdriver`), exposed when
the `all` preset is selected.

The original file is backed up under `~/.firefox-devtools-mcp/stealth/backups/<sha256>/`
before it is written. Each browser update leaves an older backup behind, so `prune` deletes
every backup except the one belonging to the file now installed, and reports what it removes;
`--dry-run` lists them first. It refuses to prune when no backup belongs to the given path, so
a mistyped path cannot wipe the directory.

The browser must be closed: the library is loaded and Windows refuses the write otherwise, which
the command reports as a busy file. Installs under `Program Files` need the elevated shell, which
they report as a permission error instead. The function is located by a byte signature rather
than a fixed address, so the same patch applies across rebuilds; when a build does not match a
known signature the command reports `unrecognized` and changes nothing. A browser update
replaces the patched file with the vendor one, so it also reports `unrecognized` until a
signature for the new build is added, and the old backup is kept but never restored over the
new install. Signatures currently cover the Windows x64 153 build; the patch is implemented for
Windows and Linux, not macOS.

### Useful preferences (`--pref`)

- `remote.prefs.recommended=false` — Firefox applies
  [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs)
  to every automation session: update checks, session restore, cache and bfcache, telemetry.
  Fine for a throwaway test profile; on a profile you browse with, set this to false. In
  `--connect-existing` mode `--pref` does not reach the browser — see
  [Connect to an existing Firefox](#connect-to-an-existing-firefox).
- `remote.log.level=Trace` — verbose WebDriver logs in Firefox. The server passes the matching
  level to geckodriver so both sides log alike.
- `app.update.disabledForTesting=false` — let Firefox download and apply updates. Updates can
  interrupt a session. Needs `remote.prefs.recommended=false` as well.

### Firefox for Android

`--android-device` automates Firefox on an Android device. Needs `adb` on `PATH`; geckodriver
is managed automatically.

> **Warning:** Android mode wipes all data of the target app before every session.
> Tabs, history, bookmarks, passwords, cookies and settings are lost. geckodriver runs
> `adb shell pm clear <package>` when creating the session, with no way to skip it, then
> uses its own temporary profile and deletes it afterwards. So `--android-device` requires
> `--android-wipe-app-data`, and the device should run a build set aside for automation.
> [Bug 2064088](https://bugzilla.mozilla.org/show_bug.cgi?id=2064088) tracks an option to
> keep the app data.

```bash
# List connected devices
adb devices

# Launch Firefox for Android on the single connected device
node dist/index.js --android-device auto --android-wipe-app-data

# Target a specific device
node dist/index.js --android-device <serial> --android-wipe-app-data

# Use Firefox Nightly instead
node dist/index.js --android-device <serial> --android-package org.mozilla.fenix --android-wipe-app-data
```

Port forwarding between the host and device is handled automatically by geckodriver.

### Connect to an existing Firefox

`--connect-existing` attaches to a Firefox that is already running, so the agent works in that
session: its tabs, its logins, its cookies. Without the flag the server launches a browser of
its own.

The profile is a choice, and both options are supported:

- **A profile of its own.** Firefox runs one process per profile, so a dedicated profile runs
  beside your everyday Firefox, and the agent only reaches what you sign in to there:

  ```bash
  firefox -CreateProfile firefox-mcp    # once
  firefox -P firefox-mcp --marionette --remote-debugging-port
  ```

- **Your everyday profile.** The agent then reaches your cookies, saved logins and open
  sessions. That is what the mode is for, and why it is opt-in.

#### 1. Turn off `remote.prefs.recommended` in that profile

A WebDriver session makes Firefox apply its test-oriented
[RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs)
unless `remote.prefs.recommended` is `false`. They land in the profile in use and change update
checks, session restore, cache and bfcache, telemetry. Set it before the agent connects:

- `about:config` → `remote.prefs.recommended` → `false` (kept in that profile), or
- `user_pref("remote.prefs.recommended", false);` in the profile's `user.js`.

`--pref remote.prefs.recommended=false` does not work here: this mode sends no
`moz:firefoxOptions` prefs, because changing prefs on a live browser can disturb the Remote
Agent. When the server launches Firefox itself, `--pref` is the way.

#### 2. Start Firefox with both remote-control flags

Both are required: WebDriver Classic (`--marionette`) and WebDriver BiDi
(`--remote-debugging-port`). With one of them the connection fails and the server asks for both.

```bash
# Quit Firefox first: the flags only affect a process that starts with them.
firefox --marionette --remote-debugging-port
```

A running instance ignores the flags and only opens a window, starting neither Marionette nor
the Remote Agent.

#### 3. Point the server at it

```bash
node dist/index.js --connect-existing --marionette-port 2828
```

2828 is the default. Pass `--marionette-port` to match a different port, for example after
`--marionette --marionette-port 4242 --remote-debugging-port`.

Marionette accepts one client at a time:

- `close_firefox_session` ends the session and leaves the browser running; restart Firefox
  without the flags afterwards;
- `--idle-timeout` (default 1800 seconds) does the same after a quiet period, so another client
  can take over;
- the next tool call reconnects and selects whichever tab is active at that moment.

`--start-url` is ignored in this mode, so connecting does not navigate the browser away.

> **Warning:** Do not leave Marionette enabled during normal browsing. It sets
> `navigator.webdriver = true` and changes other fingerprint signals, which trips bot detection
> on sites behind Cloudflare, Akamai and the like. Enable it for a session, then restart Firefox
> without the flags. The [stealth module](#hiding-the-webdriver-flag-stealth-module) makes
> `navigator.webdriver` read false while a session is active.

## Tools

[docs/tools.md](docs/tools.md) lists every tool by module, with parameters, generated from the
source.

## Saving bulky output to disk

Large tool output fills the context of CLI clients such as Claude Code. Tools with a `saveTo`
parameter write the result to a file instead; [docs/tools.md](docs/tools.md#tools-that-accept-saveto)
lists which ones. `saveTo` takes one of three forms:

- a file path (relative to the current working directory, or absolute within `~/.firefox-devtools-mcp/output`; parent directories are created). Paths reaching a Firefox profile, or the files this server reads back, are refused
- an existing directory (a timestamped file is generated inside it)
- `true` (a timestamped file is generated under `~/.firefox-devtools-mcp/output/`)

The response returns the path and byte size. The saved file always holds the full,
untruncated data: the inline size safeguards (console message caps, network header
truncation, snapshot line caps) never apply to it.

The text-producing tools also accept `preview`, a number of characters of the saved output to
echo back inline as a short excerpt. The list in docs/tools.md shows which tools support it.

```
screenshot_page({ saveTo: "page.png" })
take_snapshot({ saveTo: true })
list_network_requests({ urlContains: "api", saveTo: "network.json" })
evaluate_script({ function: "() => performance.getEntries()", saveTo: true, preview: 2000 })
```

By default, save paths are restricted: relative paths resolve against the current working
directory, and absolute paths must stay within `~/.firefox-devtools-mcp`. Escaping paths are
rejected. `--unrestricted-save-paths` removes both restrictions.

## Build from source

This repository builds the all-tools entry point (`src/index.moz.ts`), so every module is
compiled in, including `prefs`, `privileged`, `launch` and `bidi`.

```bash
npm install
npm run build:moz

# Inspector against the local build
npx @modelcontextprotocol/inspector node dist.moz/index.js --headless --viewport 1280x720

# dev with hot reload
npm run inspector:dev
```

`npm run build:moz` writes `dist.moz/`; the release archive and the `.mcpb` bundle ship that
directory as `dist/`.

Tests, lint and CI: [CONTRIBUTING.md](CONTRIBUTING.md).

## Troubleshooting

- Firefox not found: pass `--firefox-path` with the executable or its install directory.
- First run is slow: Selenium sets up the BiDi session; later runs are faster.
- Stale UIDs: a UID stays valid until its element is removed or the page navigates; take a
  fresh `take_snapshot` when a tool reports one is gone.
- Windows 10, `Error during discovery for MCP server 'firefox-devtools': MCP error -32000: Connection closed`:
  - wrap the command with `cmd /c` ([details](https://github.com/modelcontextprotocol/servers/issues/1082#issuecomment-2791786310)):

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "cmd",
        "args": ["/c", "node", "C:\\tools\\dist\\index.js"]
      }
    }
    ```

  - use the absolute path to `node` instead of relying on `PATH`:

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "C:\\nvm4w\\nodejs\\node.exe",
        "args": ["C:\\tools\\dist\\index.js"]
      }
    }
    ```

## Versioning

Pre-1.0 API: versions start at `0.x`. Each release is a `vX.Y.Z` tag on this repository; the
newest is on [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases).

## Contributing

Issues, tests and local development: [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Upstream project maintained by [Mozilla](https://www.mozilla.org). This fork is maintained by
[LTHPKBTE](https://github.com/LTHPKBTE).

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE) at your option.
