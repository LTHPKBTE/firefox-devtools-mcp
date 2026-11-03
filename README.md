# Firefox DevTools MCP

English | [简体中文](README.zh-CN.md)

[![CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT%20%2F%20Apache--2.0-blue.svg)](#license)

An MCP (Model Context Protocol) server that allows AI agents (Claude, Cursor, Codex) to inspect and automate Firefox via WebDriver BiDi.

> **Note**: Independent fork of [mozilla/firefox-devtools-mcp](https://github.com/mozilla/firefox-devtools-mcp) with unlocked internal modules and prebuilt distributions. Not affiliated with Mozilla.

---

## Fork Features

Compared to upstream `@mozilla/firefox-devtools-mcp`:
- **All 5 opt-in modules enabled**: `prefs`, `privileged`, `launch`, `bidi`, and `stealth` are compiled in by default (upstream strips them).
- **Built-in `stealth-cli`**: Binary patcher for `xul.dll` / `libxul.so` to mask `navigator.webdriver = false` against bot detection.
- **Standalone prebuilts**: Ships GitHub Release tarballs and `.mcpb` bundles (for Claude Desktop) without requiring npm or local builds.

## Requirements

- **Node.js**: ≥ 20.19.0
- **Firefox**: 100+ (153+ required for `evaluate_script` and logpoints)
- Firefox executable detected automatically on Windows; use `--firefox-path` for custom or portable paths.

---

## Quick Start

### 1. Download or Build

**Option A: Prebuilt Tarball**
Download the latest `firefox-devtools-mcp-vX.Y.Z.tar.gz` from [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases):
```bash
mkdir firefox-devtools-mcp && cd firefox-devtools-mcp
tar -xzf path/to/firefox-devtools-mcp-vX.Y.Z.tar.gz -C .
npm install --omit=dev
```

**Option B: Claude Desktop (.mcpb)**
Download `firefox-devtools-mcp-X.Y.Z.mcpb` from [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases) and double-click to install.

**Option C: Build from Source**
```bash
git clone https://github.com/LTHPKBTE/firefox-devtools-mcp
cd firefox-devtools-mcp
npm install
npm run build:moz
# Output entry point: dist.moz/index.js
```

**Option D: CI Artifact (no release yet)**
Every push to `main` uploads the build of that commit: open the latest
[CI run](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml), download the
`firefox-devtools-mcp-package` artifact and unpack it. The layout is the same as the tarball above
(`dist/`, `package.json`, READMEs, licenses), so the same commands apply:
```bash
npm install --omit=dev
# Binary is located at dist/index.js
```

### 2. Client Configuration

The server communicates over `stdio`. Replace `/path/to/dist/index.js` with your absolute local path.

#### JSON Configuration (Claude Desktop, Cursor, Cline)
```json
{
  "mcpServers": {
    "firefox-devtools": {
      "command": "node",
      "args": [
        "/path/to/dist/index.js",
        "--connect-existing",
        "--tool-preset", "mozilla",
        "--unrestricted-save-paths"
      ]
    }
  }
}
```

*Note for Windows*: Use forward slashes (`C:/tools/dist/index.js`) or escaped backslashes in paths.

#### Claude Code (CLI)
```bash
claude mcp add firefox-devtools node /path/to/dist/index.js -- --auto-profile
```

#### Test with MCP Inspector
```bash
npx @modelcontextprotocol/inspector node /path/to/dist/index.js --headless --start-url https://example.com
```

---

## Core Usage Guides

### Connect to an Existing Firefox Instance

Attach the AI agent to your active browsing session (cookies, logins, tabs) instead of launching an isolated browser.

1. **Disable test preferences**: In your target Firefox profile, set `remote.prefs.recommended = false` in `about:config` or in `user.js` (prevents Firefox from overwriting update/cache settings).
2. **Start Firefox with remote debugging flags**:
   - **Standard mode**:
     ```bash
     firefox --marionette --remote-debugging-port
     ```
   - **Privileged mode** (allows AI to access browser chrome / internal prefs; required for `--tool-preset mozilla`):
     ```bash
     firefox --marionette --remote-debugging-port -p focusmanager.testmode=false --remote-allow-system-access
     ```
3. **Launch the MCP server**:
   ```bash
   node /path/to/dist/index.js --connect-existing --tool-preset mozilla --unrestricted-save-paths
   ```

> **Warning**: Running with `--marionette` sets `navigator.webdriver = true`, tripping Cloudflare/Akamai bot detection. Restart Firefox without flags when finished, or use the `stealth` patch below.

### Hiding the WebDriver Flag (`stealth-cli`)

`navigator.webdriver` is hardcoded in Firefox binaries. `stealth-cli` binary-patches the shared library (`xul.dll` on Windows, `libxul.so` on Linux) to report `false`.

Run from an **Administrator/root terminal** with Firefox closed:

```bash
# Check status
node dist/stealth-cli.js status

# Apply patch (specify path for custom/portable browsers)
node dist/stealth-cli.js patch --firefox-path "C:\Program Files\Waterfox"

# Restore original file
node dist/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox"

# Clean up outdated update backups
node dist/stealth-cli.js prune
```
Detailed mechanism and signature offsets: [docs/stealth.md](docs/stealth.md).

### Firefox for Android

Automate Firefox on an attached Android device via ADB.

> **Warning**: Resets target app data on startup (`pm clear`). Use an isolated browser build, not your primary mobile browser.

```bash
# Auto-detect single device
node dist/index.js --android-device auto --android-wipe-app-data

# Target specific device & package
node dist/index.js --android-device <serial> --android-package org.mozilla.fenix --android-wipe-app-data
```

### Redirect Large Outputs to Disk (`saveTo`)

Prevents large outputs (snapshots, DOM trees, network dumps) from exhausting the LLM context window:

```javascript
// Supported tools accept saveTo:
screenshot_page({ saveTo: "page.png" })
take_snapshot({ saveTo: true }) // Saves to ~/.firefox-devtools-mcp/output/
evaluate_script({ function: "() => performance.getEntries()", saveTo: true, preview: 1000 })
```

---

## CLI Reference

| Flag | Env Var | Description |
| :--- | :--- | :--- |
| `--firefox-path <path>` | - | Path to Firefox executable or installation directory |
| `--headless` | `FIREFOX_HEADLESS=true` | Run Firefox without a window |
| `--viewport <WxH>` | - | Set initial viewport size (e.g. `1280x720`) |
| `--auto-profile` | `AUTO_PROFILE=true` | Persist profile under `~/.firefox-devtools-mcp/` |
| `--profile-path <path>` | - | Use an explicit custom Firefox profile directory |
| `--connect-existing` | `CONNECT_EXISTING=true` | Attach to a running browser instead of launching one |
| `--marionette-port <port>`| `MARIONETTE_PORT` | Port for existing session (default: `2828`) |
| `--tool-preset <preset>` | `TOOL_PRESET` | Preset: `slim`, `basic` (default), `developer`, `mozilla`, `all` |
| `--tools <list...>` | - | Explicitly enabled modules (overrides `--tool-preset`) |
| `--pref <key=val>` | - | Set Firefox `about:config` preference (repeatable) |
| `--unrestricted-save-paths`| `UNRESTRICTED_SAVE_PATHS`| Allow `saveTo` outside default sandbox directories |
| `--log-file <path>` | - | Redirect MCP stderr logs to a file |

### Tool Presets

- `slim`: Minimal page interaction (`pages`).
- `basic` *(default)*: Standard browsing + `evaluate_script`.
- `developer`: Adds `network`, `console`, `debugging`, `profiler`.
- `mozilla`: Adds `privileged` and `prefs` (Requires Firefox started with `--remote-allow-system-access`).
- `all`: Includes all modules + in-session stealth patching tools.

Full API & tool documentation: [docs/tools.md](docs/tools.md).

---

## Troubleshooting

- **Firefox binary not found**: Explicitly pass `--firefox-path "/path/to/firefox"`.
- **Stale UIDs**: Element UIDs change on navigation or DOM restructuring. Call `take_snapshot` again.
- **Windows Connection Closed Error (`-32000`)**: Wrap the node call with `cmd /c` in your MCP client JSON:
  ```json
  "command": "cmd",
  "args": ["/c", "node", "C:\\tools\\dist\\index.js"]
  ```

---

## Uninstall

1. **Restore browser binary** (if stealth patch was applied):
   ```bash
   node dist/stealth-cli.js restore --firefox-path "/path/to/firefox"
   node dist/stealth-cli.js prune
   ```
2. **Remove client config**: Remove the `firefox-devtools` block from your MCP client's config file (or run `claude mcp remove firefox-devtools`).
3. **Delete files**: Delete the cloned/extracted repository directory and the persistent configuration directory:
   - Windows: `%USERPROFILE%\.firefox-devtools-mcp`
   - Linux/macOS: `~/.firefox-devtools-mcp`

---

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE).
