# The stealth patch

The `stealth` command makes `navigator.webdriver` read `false` while Firefox is under automation.
Preferences and page scripts cannot do this, so the command edits the browser's shared library
instead. This page covers the mechanism; usage is in the README's
[Hiding the WebDriver flag](../README.md#hiding-the-webdriver-flag-stealth-module).

## Why the page cannot answer for it

`navigator.webdriver` is answered in C++. `Navigator::Webdriver()` asks the remote agent and
Marionette whether automation is running and returns that bool. The value is decided before page
script runs, so `Object.defineProperty` and proxy wrappers either change nothing or leave a
detectable artifact. The only lever is the code that produces the value.

## What is written

`src/firefox/stealth.ts` overwrites the entry of that function — in `xul.dll` on Windows, in
`libxul.so` on Linux, both inside the install directory — with three bytes:

```
31 C0  C3        xor eax, eax ; ret
```

The function returns `false` immediately and never builds the stack frame the original prologue
would, which is harmless: the caller still finds a `bool` in `eax`, and the three bytes are
self-contained. Nothing else in the file changes — no section headers, imports or checksums — so
the browser starts and runs normally.

## Finding the function in an unknown build

Addresses differ in every build, so each supported build contributes a byte pattern for the start
of `Navigator::Webdriver()`:

- instruction encodings and stack layout are literal bytes;
- 32-bit RIP displacements are wildcards (`??`), because they are relocated at link time and
  differ per build;
- the longest literal run in the pattern becomes the search needle, so the scan jumps between its
  occurrences instead of testing every offset of a 100 MB library.

A pattern must match exactly one place. Several matches means the signature is ambiguous and the
command refuses to guess; no match means the build is unknown, reported as `unrecognized`, with
nothing written.

A new build means a new signature entry, not a loosened existing one. `WEBDRIVER_SIGNATURES`
holds them, each named after the build it was taken from; `win-x64-153` is the only entry today.
Patching is implemented for Windows and Linux. macOS is refused: the library lives inside a
bundle and may be universal, so one offset would not apply to every slice.

## Records and the way back

Before the write, the original file is copied to
`~/.firefox-devtools-mcp/stealth/backups/<first 16 hex digits of its SHA-256>/`, next to a
`record.json`:

| field | use |
| --- | --- |
| `modulePath` | install the record belongs to |
| `originalSha256` | identifies the backup, and the file a restore expects |
| `patchedSha256` | identifies a file this command produced |
| `signatureId` | which pattern matched |
| `fileOffset` | where the patch site is |
| `originalBytes`, `patchedBytes` | what must be there to patch, and what patch writes |

`status` hashes the installed library and reports one of three states:

- `patched` — matches a `patchedSha256`: the patch is in place, `restore` reverts it;
- `unpatched` — matches an `originalSha256` or a signature: `patch` can be applied;
- `unrecognized` — neither: usually a browser update replaced the file, so the vendor file is
  already in place and there is nothing to restore.

`restore` copies the backup back, after checking the bytes at `fileOffset` are still the patched
ones. `prune` deletes every backup except the one belonging to the file now installed, and
refuses when no backup belongs to the given path, so a mistyped path cannot clear the directory.

A browser update replaces both the library and its build metadata, so a stale record is detected
rather than applied: the hashes no longer match, and the command reports `unrecognized` until a
signature for the new build exists. The old backup stays on disk and is never restored over the
new install.

## Measured

Windows x64 build 153, with an automation session attached:

| step | `navigator.webdriver` |
| --- | --- |
| before `patch` | `true` |
| after `patch` | `false` |
| after `restore` | `true` |

The session kept working across all three steps. The browser only has to be closed while bytes
are written: Windows refuses to write a loaded library, reported as a busy file.

## Operating constraints

- The write lands in the install directory. An install under `Program Files` needs an elevated
  shell, otherwise reported as a permission error.
- The patch is per install and per build: it survives restarts and profile changes, and is gone
  when the browser updates.
- The MCP tools (`get_stealth_status`, `patch_navigator_webdriver`,
  `restore_navigator_webdriver`) run the same code inside the server process, with whatever
  privileges the client started that process with. The standalone command is the way to get
  elevation deliberately.
