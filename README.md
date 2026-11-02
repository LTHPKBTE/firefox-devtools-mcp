# Firefox DevTools MCP

English | [简体中文](README.zh-CN.md)

> **This is not a Mozilla repository.** This fork lives at
> [LTHPKBTE/firefox-devtools-mcp](https://github.com/LTHPKBTE/firefox-devtools-mcp) and builds
> the all-tools variant, which includes the Mozilla-only modules for inspecting Firefox's
> privileged layer. The upstream project is
> [mozilla/firefox-devtools-mcp](https://github.com/mozilla/firefox-devtools-mcp) — use it for
> issues, releases and the official `@mozilla/firefox-devtools-mcp` package.

[![CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE-MIT) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE-APACHE)

Model Context Protocol server that lets AI agents use Firefox. It has two main use cases:

- **Agentic browsing**: the agent uses the browser for regular tasks, such as reading pages, filling forms and going through multi-step flows on websites.
- **Agent-assisted web development**: the agent loads the page you are working on and inspects it with developer tools, such as the console, network requests, the debugger and the profiler.

It controls Firefox through WebDriver BiDi (via Selenium WebDriver) and works with Claude Code, Claude Desktop, Cursor, Cline and other MCP clients.

Repository: https://github.com/LTHPKBTE/firefox-devtools-mcp

Upstream: https://github.com/mozilla/firefox-devtools-mcp

> **Note**: This MCP server requires a local Firefox browser installation and cannot run on cloud hosting services like glama.ai. Start with [Install](#install): build it from audited source, or use an artifact this repository built. The upstream public build, which has no Mozilla-only modules, is documented in the [upstream README](https://github.com/mozilla/firefox-devtools-mcp#readme).

## Security

Browser MCP servers carry inherent risks. A few key practices:

- **Use a dedicated Firefox profile.** Never run the server against your regular profile — the agent has access to whatever the browser can reach, including cookies and saved sessions. `--connect-existing` exists for the cases where your own session is the point; it gives the agent the same reach, so use it deliberately and only while a session is active. See [Connect to an existing Firefox](#connect-to-an-existing-firefox-the-agent-drives-your-own-browser).
- **Be cautious about which sites you visit.** Pages can return content designed to manipulate the agent (prompt injection). Stick to sites you control or trust.
- **Enable only the tool modules you need.** The default `basic` preset already includes `evaluate_script`; `--tool-preset slim` drops it. Higher presets such as `--tool-preset developer` (debugging, network, console, profiler) and `--tool-preset mozilla` (privileged context) expand what the agent can do further.

See [SECURITY.md](SECURITY.md) for a full breakdown of risks and how to report vulnerabilities.

## Requirements

- Node.js ≥ 20.19.0
- Firefox 100+ installed (auto‑detected, or pass `--firefox-path`)

## Install

**Audit the source and build it yourself.** This server drives your browser, and the `stealth`
command rewrites a file inside your Firefox installation, so the code is worth reading before
it runs. Clone the repository, read `src/`, then build it:

```bash
git clone https://github.com/LTHPKBTE/firefox-devtools-mcp
cd firefox-devtools-mcp
npm install
npm run build:moz
node dist.moz/index.js --auto-profile
```

See [Build from source](#build-from-source) for the test suite and the other scripts.

The prebuilt artifacts below are produced by this repository's GitHub Actions from the tagged
source, so you can compare them against the code before running them.

Nothing is installed system-wide, and [Uninstall](#uninstall) covers the reverse steps: undo the
browser patch, remove the client entry, delete the extracted and data directories.

### Install a prebuilt build (this fork)

This fork is not published to npm or the MCP registry — those names belong to upstream — so
everything is built by GitHub Actions and downloaded from GitHub:

- **Release** — [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases),
  created when a `vX.Y.Z` tag is pushed:
  - `firefox-devtools-mcp-vX.Y.Z.tar.gz` — the all-tools build, for any MCP client
  - `firefox-devtools-mcp-X.Y.Z.mcpb` — Claude Desktop extension, installed with one click
- **Latest `main` build** — Actions → [CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)
  → newest run → *Artifacts* → `dist.moz/`. Needs a GitHub account and is deleted after 7 days.

From the tarball:

```bash
mkdir firefox-devtools-mcp
tar -xzf firefox-devtools-mcp-v0.10.7.tar.gz -C firefox-devtools-mcp
cd firefox-devtools-mcp
npm install --omit=dev
node dist/index.js --auto-profile             # the MCP server (stdio)
node dist/stealth-cli.js status               # optional: the binary patch command
```

Then point your client at that absolute path, for example with Claude Code:

```bash
claude mcp add firefox-devtools node /absolute/path/to/firefox-devtools-mcp/dist/index.js -- --auto-profile
```

The `.tar.gz` holds `dist/` plus `package.json`, so `npm install --omit=dev` is the only extra
step; `dist/stealth-cli.js` and the `dist/snapshot.injected.global.js` browser script travel
with it. Presets work as described below, and `--tool-preset all` is the one that also exposes
the `stealth` tools.

Commands below assume that release layout (`dist/index.js`). A checkout built with
`npm run build:moz` writes `dist.moz/index.js` instead, so adjust the path.

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

There is no installer, service or global package to remove: the server is a directory you
extracted or built, and everything else it writes lives under `~/.firefox-devtools-mcp`
(`%USERPROFILE%\.firefox-devtools-mcp` on Windows). Three steps, in this order.

**1. Undo the browser patch, if you applied it.** In a shell started as administrator, with
Firefox closed:

```bash
node dist/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox\waterfox.exe"
node dist/stealth-cli.js prune
```

`restore` copies the backup over the patched library and `prune` deletes the backups of
superseded installs. One backup of the file now installed is kept on purpose, because deleting
it would make `restore` impossible; step 3 removes it. Skip both commands if you never ran
`patch`. If the browser was updated in the meantime, `status` reports `unrecognized` and the
vendor's file is already in place, so there is nothing to restore.

**2. Remove the client entry.** `claude mcp remove firefox-devtools`, or delete the
`firefox-devtools` block from the JSON or TOML shown in
[Register the server with your client](#register-the-server-with-your-client). If you installed
the `.mcpb` bundle, remove the extension in Claude Desktop's settings instead.

**3. Delete the files.** The extracted directory, and the data directory `~/.firefox-devtools-mcp`
(`%USERPROFILE%\.firefox-devtools-mcp`). The data directory holds the `--auto-profile` or
`--profile-path` profile this server created, `saveTo` output, captured Firefox logs, and the
stealth backups and records. Deleting it discards the logins that profile collected while the
agent used it; your own Firefox profile is not touched.

geckodriver is either resolved from `PATH` or `~/.cache/selenium` — shared with other Selenium
projects, so leaving it is usually right — or downloaded inside the extracted directory, which
step 3 removes.

## Upstream package

The upstream project publishes its public build to npm. For `npx @mozilla/firefox-devtools-mcp@latest`,
the client-specific install commands and the rest of that package's documentation, see the
[upstream README](https://github.com/mozilla/firefox-devtools-mcp#readme). That build contains
only the public modules, so its instructions do not apply to this fork's build.

## Try it with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js --start-url https://example.com --headless
```

Then call tools like:

- `list_pages`, `select_page`, `navigate_page`
- `take_snapshot` then `click_by_uid` / `fill_by_uid`
- `list_network_requests` (always‑on capture), `get_network_request`
- `list_downloads` (always‑on capture), `set_download_behavior`
- `screenshot_page`, `list_console_messages`

## CLI options

You can pass flags or environment variables (names on the right):

- `--firefox-path` — absolute path to Firefox binary
- `--headless` — run without UI (`FIREFOX_HEADLESS=true`)
- `--viewport 1280x720` — initial window size
- `--profile-path` — use a specific Firefox profile. Firefox runs in a `firefox_devtools_mcp_profile` subfolder of that path, marked with a `.firefox-devtools-mcp` file; pointing `--profile-path` at a marked profile reuses it directly
- `--auto-profile` — reuse a persistent profile stored under `~/.firefox-devtools-mcp/`, so logins survive between runs. Scoped to the binary when `--firefox-path` is given (`AUTO_PROFILE=true`)
- `--firefox-arg` — extra Firefox arguments (repeatable)
- `--start-url` — open this URL on start (`START_URL`)
- `--accept-insecure-certs` — ignore TLS errors (`ACCEPT_INSECURE_CERTS=true`)
- `--connect-existing` — attach to an already-running Firefox instead of launching a new one (`CONNECT_EXISTING=true`). See [Connect to an existing Firefox](#connect-to-an-existing-firefox-the-agent-drives-your-own-browser)
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
- `--log-file` — write MCP server logs to a file instead of stderr. Useful for debugging sessions with MCP clients that hide server output. Set `DEBUG=*` to also include verbose debug logs. Example: `--log-file /tmp/firefox-mcp.log`


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

See [docs/tools.md](docs/tools.md#modules-and-presets) for the list of modules and the modules
in each preset.

Note that `basic`, the default, includes `script` and therefore the `evaluate_script` tool.
See [SECURITY.md](SECURITY.md#tool-modules-and-presets) for what that means for the attack
surface, and use `--tool-preset slim` or an explicit `--tools` list to drop it.

```bash
# Use the developer preset (adds network, console, debugging and profiler tools)
node dist/index.js --tool-preset developer

# Enable only the modules you need
node dist/index.js --tools pages network console

# Or keep that list in a file: ["pages", "network", "console"]
node dist/index.js --tool-preset ./my-tools.json
```

`--tool-preset` takes a built-in name or the path to a JSON file holding either an array of
module names or `{ "modules": [...] }`, so a custom set can live in the repository or in the
MCP client configuration instead of the command line.

The `prefs` and `privileged` modules require `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`. The `launch`
module restarts Firefox under a caller-chosen binary, profile, environment and set of
preferences, which is a configuration change the operator should own. The `bidi` module sends
any WebDriver BiDi command, so it gives access to what the other modules expose. The `stealth`
module edits the installed browser binary, so it needs elevation the server usually lacks: it is
not part of `mozilla` and is meant to be run from a separate command, included in `all`; see
[Hiding the WebDriver flag](#hiding-the-webdriver-flag-stealth-module). This fork builds all
five modules in; the upstream public package skips them even if requested and logs a warning
naming the modules it dropped.

### Hiding the WebDriver flag (`stealth` module)

`navigator.webdriver` is answered by C++ — `Navigator::Webdriver()` asks the remote agent and
Marionette whether automation is running — so no preference or page script can change it. The
`stealth` module changes the answer where it is produced: it finds that function in the shared
library the browser loads (`xul.dll` on Windows, `libxul.so` on Linux) and overwrites its entry
with `xor eax, eax; ret`, which makes the property read false while an automation session is
active. This was verified against the browser: with the patch `navigator.webdriver` is `false`
and the session still works, and restoring the file brings `true` back.

Because the write lands in the install directory, the work is done by a separate command that
you run from a shell started as administrator — the server itself stays unprivileged:

```bash
# After `npm run build:moz` (the release tarball ships this file as dist/stealth-cli.js)
node dist.moz/stealth-cli.js status
node dist.moz/stealth-cli.js patch --firefox-path "C:\Program Files\Waterfox\waterfox.exe"
node dist.moz/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox\waterfox.exe"
node dist.moz/stealth-cli.js prune --dry-run   # then drop --dry-run
```

`--firefox-path` defaults to a detected **Firefox** install on Windows: `Program Files`, the
`firefox.exe` App Paths registry entries, or `PATH`. Other builds — Waterfox, LibreWolf, a
portable copy — are only found when you pass the path, which is why the examples above do.
`status`, `patch` and `restore`
also exist as MCP tools of the same names (`get_stealth_status`, `patch_navigator_webdriver`,
`restore_navigator_webdriver`) and are exposed when the `all` preset is selected.

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

- remote.prefs.recommended=false. When Firefox runs in automation, it applies [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs) that modify browser behavior for testing. Set remote.prefs.recommended to false to skip those and have a configuration closer to a regular Firefox instance. **Set this whenever the profile also holds your own data**: the recommended prefs are meant for throwaway test profiles, and on a profile you browse with they change real settings (updates, session restore, cache/bfcache, telemetry). In `--connect-existing` mode `--pref` cannot reach the browser, so set the pref in `about:config` first — see [Connect to an existing Firefox](#connect-to-an-existing-firefox-the-agent-drives-your-own-browser).
- remote.log.level=Trace. Enable verbose WebDriver protocol logs in Firefox. The MCP server will automatically pass the matching log level to geckodriver so both sides log at the same verbosity.
- app.update.disabledForTesting=false. Allow Firefox to automatically download and apply updates. Note that updates may interrupt your session. Requires also setting remote.prefs.recommended=false.

### Firefox for Android

Use `--android-device` to automate Firefox running on an Android device. Requires `adb` on your PATH and geckodriver, which is managed automatically.

> **Warning:** Android mode wipes all data of the target app before every session.
> Tabs, history, bookmarks, passwords, cookies and settings are all lost. geckodriver runs
> `adb shell pm clear <package>` when creating the session and offers no way to skip it,
> then runs the session on its own temporary profile which is deleted afterwards.
> Because of this, `--android-device` requires `--android-wipe-app-data`, and you should
> install a build dedicated to automation rather than automating the browser you use.
> [Bug 2064088](https://bugzilla.mozilla.org/show_bug.cgi?id=2064088) tracks adding an
> option to geckodriver to keep the existing app data.

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

### Connect to an existing Firefox (the agent drives your own browser)

By default the server launches a Firefox of its own. `--connect-existing` attaches to the
browser you already run instead, so the agent works in your session: your tabs, your logins,
your cookies, no second profile to sign in to again. This is the way to let an agent operate the
browser you actually use.

#### 1. Prepare the profile: `remote.prefs.recommended=false`

When a WebDriver session starts, Firefox applies its test-oriented
[RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs)
unless `remote.prefs.recommended` is `false`. Those prefs are written to the profile in use and
change update checking, session restore, cache and bfcache, telemetry and more, because they
assume a disposable test profile. Turn them off before you let the agent in, or it will treat
your own profile as an automation profile and rearrange settings you rely on:

- `about:config` → `remote.prefs.recommended` → `false` (kept in that profile), or
- add `user_pref("remote.prefs.recommended", false);` to the profile's `user.js`.

`--pref remote.prefs.recommended=false` does **not** help here: in this mode the server sends no
`moz:firefoxOptions` prefs, because changing prefs on a live browser can disturb the Remote
Agent. Set the pref in the browser as shown above. When the server launches Firefox itself,
`--pref` is the right way to say it, and this section does not apply.

#### 2. Start Firefox with remote control enabled

Both flags are required, because the server uses WebDriver Classic (`--marionette`) and
WebDriver BiDi (`--remote-debugging-port`). With only one of them the connection fails and the
server tells you to restart with both:

```bash
# Quit Firefox first: the flags only affect a process that starts with them.
firefox --marionette --remote-debugging-port
```

If Firefox is already running, this command only opens a window in that instance: the flags are
ignored, so neither Marionette nor the Remote Agent starts. Quit Firefox completely, then run it
with the flags.

#### 3. Point the server at it

```bash
node dist/index.js --connect-existing --marionette-port 2828
```

2828 is the default. Pass `--marionette-port` to match a different port, for example if you
started Firefox with `--marionette --marionette-port 4242 --remote-debugging-port`.

Marionette accepts one client at a time, so:

- `close_firefox_session` ends the session and leaves your browser running — use it when the
  task is done, then restart Firefox without the flags;
- `--idle-timeout` (default 1800 seconds) does the same automatically after a quiet period, so
  another client can take over;
- the next tool call reconnects and selects whichever tab is active at that moment.

`--start-url` is ignored in this mode, so connecting never navigates your browser away from what
you were looking at.

#### If you would rather not use your everyday profile

Give the server its own profile instead: Firefox runs one process per profile, so both instances
run side by side, and the agent only reaches what you sign in to in that profile:

```bash
# Once: create a dedicated profile
firefox -CreateProfile firefox-mcp

# Start it with Marionette and the Remote Agent, next to your everyday Firefox
firefox -P firefox-mcp --marionette --remote-debugging-port
```

> **Warning:** Do not leave Marionette enabled during normal browsing. It sets
> `navigator.webdriver = true` and changes other browser fingerprint signals,
> which can trigger bot detection on sites protected by Cloudflare, Akamai, etc.
> Only enable Marionette when you need MCP automation, then restart Firefox
> normally afterward, or run it in a dedicated profile as shown above. The
> [stealth module](#hiding-the-webdriver-flag-stealth-module) can make
> `navigator.webdriver` read false while a session is active.

## Tool overview

See [docs/tools.md](docs/tools.md) for the full list of tools by module, with
descriptions and parameters (generated from the source).

### Saving bulky output to disk

Large tool output can consume significant context in CLI clients like Claude Code. Several
tools accept an optional `saveTo` parameter that writes the result to a file instead of
returning it inline. See [docs/tools.md](docs/tools.md#tools-that-accept-saveto) for the list.
`saveTo` takes one of three forms:

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
directory, and absolute paths are only allowed within `~/.firefox-devtools-mcp`. Paths that
escape these locations are rejected. Start the server with `--unrestricted-save-paths` to
write to arbitrary locations, including absolute paths outside that directory.

Saved files can then be viewed for instance with Claude Code's `Read` tool without impacting context size.

## Build from source

The builds from this repository use the all-tools entry point (`src/index.moz.ts`), so every
tool module is compiled in, including `prefs`, `privileged`, `launch` and `bidi`.

```bash
npm install
npm run build:moz

# Run with Inspector against the local build
npx @modelcontextprotocol/inspector node dist.moz/index.js --headless --viewport 1280x720

# Or run in dev with hot reload
npm run inspector:dev
```

`npm run build:moz` writes `dist.moz/`. The release archive and the `.mcpb` bundle ship that
directory as `dist/`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details on local development, testing, and CI.

## Troubleshooting

- Firefox not found: pass `--firefox-path "/Applications/Firefox.app/Contents/MacOS/firefox"` (macOS) or the correct path on your OS.
- First run is slow: Selenium sets up the BiDi session; subsequent runs are faster.
- Stale UIDs: a UID stays valid until its element is removed or the page navigates; take a fresh snapshot (`take_snapshot`) when a UID tool reports one is gone.
- Windows 10: Error during discovery for MCP server 'firefox-devtools': MCP error -32000: Connection closed
  - **Solution 1** Wrap the command with `cmd /c` ([details](https://github.com/modelcontextprotocol/servers/issues/1082#issuecomment-2791786310)):

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "cmd",
        "args": ["/c", "node", "C:\\tools\\dist\\index.js"]
      }
    }
    ```

  - **Solution 2** Use the absolute path to `node` instead of relying on `PATH`:

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "C:\\nvm4w\\nodejs\\node.exe",
        "args": ["C:\\tools\\dist\\index.js"]
      }
    }
    ```

## Versioning

- Pre‑1.0 API: versions start at `0.x`. Each release is a `vX.Y.Z` tag on this repository; take
  the newest one from [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to file issues, run tests, and work on the project locally.

## Author

Upstream project maintained by [Mozilla](https://www.mozilla.org). This fork is maintained by
[LTHPKBTE](https://github.com/LTHPKBTE).

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE) at your option.
