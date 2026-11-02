/**
 * Binary-level stealth patches.
 *
 * `navigator.webdriver` is read straight from C++: Navigator::Webdriver() asks
 * the remote agent and marionette whether automation is running, so no page
 * script can hide it. The only way to make the property read false while the
 * browser is under automation is to change the code that produces it, which
 * means editing the shared library the browser loads (xul.dll on Windows,
 * libxul.so on Linux).
 *
 * Editing a shipped binary needs two things this module provides: a way to find
 * the function in a build whose addresses are unknown (a byte signature over the
 * function prologue, with the relocated displacements masked out), and a way
 * back — the original file is copied here before it is touched, keyed by its
 * SHA-256, so a later browser update cannot silently pair an old backup with a
 * new file.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homeRoot } from '../utils/paths.js';
import { logDebug } from '../utils/logger.js';

/** Root of everything this module keeps on disk. */
function stealthDir(): string {
  return join(homeRoot(), 'stealth');
}

/** One directory per backed-up original file, named after its hash. */
function backupsDir(): string {
  return join(stealthDir(), 'backups');
}

/** Name of the record written next to a backed-up module. */
const RECORD_FILE = 'record.json';

/**
 * Bytes written over the patch site: `xor eax, eax; ret` — the function returns
 * false without touching the stack, so the omitted prologue cannot matter.
 */
export const PATCH_BYTES = Buffer.from([0x31, 0xc0, 0xc3]);

/**
 * A byte pattern with `null` at every position holding a relocated value.
 *
 * Only the instruction encoding and the stack layout are matched; the 32-bit
 * RIP displacements differ in every build, so they are wildcards. Everything
 * else staying literal keeps the signature from matching unrelated code.
 */
export interface PatchSignature {
  id: string;
  pattern: ReadonlyArray<number | null>;
}

/**
 * Signatures of the function that reports automation to `Navigator`. Each entry
 * names the build family it was taken from; add a new one when a rebuild no
 * longer matches, rather than loosening an existing entry.
 */
export const WEBDRIVER_SIGNATURES: readonly PatchSignature[] = [
  {
    // Navigator::Webdriver() in xul.dll of the Windows x64 153 build: two
    // do_GetService calls (remote agent, marionette) whose results decide the
    // returned bool.
    id: 'win-x64-153',
    pattern: hexPattern(
      '56 57 55 53 48 83 EC ?? 48 8B 05 ?? ?? ?? ?? 48 31 E0 48 89 44 24 30 ' +
        '48 8D 05 ?? ?? ?? ?? 48 8D 4C 24 28 48 89 01 48 8D 15 ?? ?? ?? ?? ' +
        '4C 8D 44 24 20 E8 ?? ?? ?? ?? 85 C0'
    ),
  },
];

/** Parses a `hex [hex|??] ...` string into a pattern. */
export function hexPattern(text: string): Array<number | null> {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => (token === '??' ? null : Number.parseInt(token, 16)));
}

/**
 * The longest run of literal bytes in a pattern, used as the search needle:
 * jumping straight to occurrences of a run beats testing every offset of a
 * 100+ MB library.
 */
function literalRun(pattern: ReadonlyArray<number | null>): { start: number; bytes: Buffer } {
  let bestStart = 0;
  let bestLength = 0;
  let start = -1;
  let length = 0;
  for (let i = 0; i < pattern.length; i++) {
    const byte = pattern[i];
    if (byte === null || byte === undefined) {
      start = -1;
      length = 0;
      continue;
    }
    if (start < 0) {
      start = i;
      length = 0;
    }
    length++;
    if (length > bestLength) {
      bestStart = start;
      bestLength = length;
    }
  }
  const bytes = Buffer.alloc(bestLength);
  for (let i = 0; i < bestLength; i++) {
    bytes[i] = pattern[bestStart + i] ?? 0;
  }
  return { start: bestStart, bytes };
}

function matchesAt(data: Buffer, offset: number, pattern: ReadonlyArray<number | null>): boolean {
  if (offset < 0 || offset + pattern.length > data.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i];
    if (expected === null || expected === undefined) {
      continue;
    }
    if (data[offset + i] !== expected) {
      return false;
    }
  }
  return true;
}

/** Every offset in the buffer where the pattern matches. */
export function findPattern(data: Buffer, pattern: ReadonlyArray<number | null>): number[] {
  const run = literalRun(pattern);
  if (run.bytes.length === 0) {
    throw new Error('Patch signature has no literal bytes to search for');
  }
  const hits: number[] = [];
  let at = data.indexOf(run.bytes);
  while (at !== -1) {
    const candidate = at - run.start;
    if (matchesAt(data, candidate, pattern)) {
      hits.push(candidate);
    }
    at = data.indexOf(run.bytes, at + 1);
  }
  return hits;
}

/** Where a patch applies inside a module. */
export interface PatchSite {
  signatureId: string;
  fileOffset: number;
  /** Bytes the module holds at the site; kept so a restore can be checked. */
  originalBytes: Buffer;
}

/**
 * Locates the patch site in a module, without interpreting what the bytes there
 * hold.
 *
 * Throws when the build is not recognized: guessing between several candidate
 * offsets, or patching a build whose code merely looks similar, would break the
 * browser instead of hiding the flag.
 */
function locateSignature(data: Buffer): { signatureId: string; fileOffset: number } {
  const matched: Array<{ signature: PatchSignature; offsets: number[] }> = [];
  for (const signature of WEBDRIVER_SIGNATURES) {
    const offsets = findPattern(data, signature.pattern);
    if (offsets.length > 0) {
      matched.push({ signature, offsets });
    }
  }

  const only = matched.length === 1 ? matched[0] : undefined;
  if (!only) {
    throw new Error(
      matched.length === 0
        ? 'This browser build is not recognized: no known signature matches its shared library. ' +
          'The patch offsets are build-specific, so a new signature has to be added for it.'
        : 'This browser build matches several patch signatures ambiguously, so it is left untouched.'
    );
  }
  if (only.offsets.length > 1) {
    throw new Error(
      `Signature "${only.signature.id}" matches ${only.offsets.length} places in this build, ` +
        'so the patch site is ambiguous and nothing was changed.'
    );
  }

  const fileOffset = only.offsets[0];
  if (fileOffset === undefined) {
    throw new Error(`Signature "${only.signature.id}" matched no place in this build`);
  }
  return { signatureId: only.signature.id, fileOffset };
}

/**
 * Locates the patch site in an unpatched module, together with the bytes it
 * holds there, so a later write can be checked against them.
 */
export function locatePatchSite(data: Buffer): PatchSite {
  const { signatureId, fileOffset } = locateSignature(data);
  return {
    signatureId,
    fileOffset,
    originalBytes: Buffer.from(data.subarray(fileOffset, fileOffset + PATCH_BYTES.length)),
  };
}

/** Version and build id as the install records them in platform.ini. */
export interface BuildInfo {
  version: string | null;
  buildId: string | null;
}

/** Minimal INI reader: `[section]` headers and `key=value` lines. */
export function parseIni(text: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let current = sections[''] ?? {};
  sections[''] = current;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      continue;
    }
    const header = /^\[(.+)]$/.exec(trimmed);
    if (header?.[1]) {
      const name = header[1];
      current = sections[name] ?? {};
      sections[name] = current;
      continue;
    }
    const pair = /^([^=]+)=(.*)$/.exec(trimmed);
    if (pair?.[1] !== undefined && pair[2] !== undefined) {
      current[pair[1].trim()] = pair[2].trim();
    }
  }
  return sections;
}

/** Reads the version markers next to the shared library. */
export function readBuildInfo(installDir: string): BuildInfo {
  const platformIni = join(installDir, 'platform.ini');
  if (!existsSync(platformIni)) {
    return { version: null, buildId: null };
  }
  const sections = parseIni(readFileSync(platformIni, 'utf-8'));
  return {
    version: sections['Build']?.['Milestone'] ?? null,
    buildId: sections['Build']?.['BuildID'] ?? null,
  };
}

/** The shared library that holds the browser's C++ code, per platform. */
export function moduleFileName(): string {
  if (process.platform === 'win32') {
    return 'xul.dll';
  }
  if (process.platform === 'darwin') {
    return 'XUL';
  }
  return 'libxul.so';
}

/**
 * Path of the module to patch for a browser executable.
 *
 * macOS is not supported: the library lives inside a bundle and may be a
 * universal binary, so the signature offsets would apply to no single slice.
 */
export function resolveModulePath(binaryPath: string): string {
  if (process.platform === 'darwin') {
    throw new Error('Patching the browser library is implemented for Windows and Linux only');
  }
  return join(dirname(binaryPath), moduleFileName());
}

/**
 * What an earlier patch run recorded about one file.
 *
 * Both hashes are stored: the original identifies which backup to restore, the
 * patched one identifies a file that this module produced. A browser update
 * replaces both, which is how a stale record is detected instead of applied.
 */
export interface PatchRecord {
  modulePath: string;
  originalSha256: string;
  patchedSha256: string;
  size: number;
  signatureId: string;
  fileOffset: number;
  originalBytes: string;
  patchedBytes: string;
  version: string | null;
  buildId: string | null;
  createdAt: string;
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Directory holding the backup for one original file. */
function backupDirFor(originalSha256: string): string {
  return join(backupsDir(), originalSha256.slice(0, 16));
}

/** Reads every patch record from disk, newest first. */
export function listRecords(): PatchRecord[] {
  const root = backupsDir();
  if (!existsSync(root)) {
    return [];
  }
  const records: PatchRecord[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = join(root, entry.name, RECORD_FILE);
    if (!existsSync(file)) {
      continue;
    }
    try {
      records.push(JSON.parse(readFileSync(file, 'utf-8')) as PatchRecord);
    } catch (error) {
      logDebug(`Ignoring unreadable stealth record ${file}: ${String(error)}`);
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Path of the backup copy that belongs to a record. */
export function backupPathFor(record: PatchRecord): string {
  return join(backupDirFor(record.originalSha256), moduleFileName());
}

/** State of one module file as the tools report it. */
export interface ModuleStatus {
  modulePath: string;
  size: number;
  sha256: string;
  build: BuildInfo;
  /**
   * - `patched`: the file is the one this module produced.
   * - `unpatched`: the file is a known original, either recorded before or
   *   matching a signature, so a patch can be applied.
   * - `unrecognized`: the file is neither, typically after a browser update
   *   whose build has no signature yet.
   */
  state: 'patched' | 'unpatched' | 'unrecognized';
  site: PatchSite | null;
  record: PatchRecord | null;
  /** Number of backups on disk, i.e. installs this module has touched. */
  backupCount: number;
}

/** Reads a module and classifies it. */
export function getModuleStatus(modulePath: string): ModuleStatus {
  const data = readFileSync(modulePath);
  const hash = sha256(data);
  const build = readBuildInfo(dirname(modulePath));
  const records = listRecords();
  const backupCount = records.length;

  const patched = records.find((record) => record.patchedSha256 === hash);
  if (patched) {
    return {
      modulePath,
      size: data.length,
      sha256: hash,
      build,
      state: 'patched',
      site: {
        signatureId: patched.signatureId,
        fileOffset: patched.fileOffset,
        originalBytes: Buffer.from(patched.originalBytes, 'hex'),
      },
      record: patched,
      backupCount,
    };
  }

  const original = records.find((record) => record.originalSha256 === hash);
  if (original) {
    return {
      modulePath,
      size: data.length,
      sha256: hash,
      build,
      state: 'unpatched',
      site: {
        signatureId: original.signatureId,
        fileOffset: original.fileOffset,
        originalBytes: Buffer.from(original.originalBytes, 'hex'),
      },
      record: original,
      backupCount,
    };
  }

  // Not seen before: a signature match decides whether it can be patched. A
  // patched file cannot match, because the patch overwrites the first bytes of
  // the signature, so losing the record leaves the file unrecognized.
  try {
    const site = locatePatchSite(data);
    return {
      modulePath,
      size: data.length,
      sha256: hash,
      build,
      state: 'unpatched',
      site,
      record: null,
      backupCount,
    };
  } catch {
    return {
      modulePath,
      size: data.length,
      sha256: hash,
      build,
      state: 'unrecognized',
      site: null,
      record: null,
      backupCount,
    };
  }
}

/** Outcome of a patch or restore run. */
export interface PatchOutcome {
  modulePath: string;
  /** True when the file was written; false when it was already in that state. */
  changed: boolean;
  status: ModuleStatus;
}

/**
 * Turns the two ways a write to an installed module fails into a diagnosis.
 *
 * Windows opens a loaded library without write sharing, so a running browser
 * shows up as EBUSY, while an install under Program Files without elevation
 * shows up as EPERM — measuring both is what keeps the message honest.
 */
function describeWriteFailure(error: unknown, modulePath: string): Error | null {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EBUSY' || code === 'ETXTBSY') {
    return new Error(
      `Cannot write to ${modulePath}: the browser is running from that install. ` +
        'Close every browser window first, then try again.'
    );
  }
  if (code === 'EPERM' || code === 'EACCES') {
    return new Error(
      `Cannot write to ${modulePath}: the file is not writable by this user. ` +
        'Installs under Program Files need the server to run elevated.'
    );
  }
  return null;
}

/**
 * Writes bytes at an offset in place.
 *
 * A copy of the file still has to be made first: the browser refuses to start
 * with a truncated library, so there is no safe partial state to fall back to.
 */
function writeInPlace(modulePath: string, offset: number, bytes: Buffer): void {
  const fd = openSync(modulePath, 'r+');
  try {
    writeSync(fd, bytes, 0, bytes.length, offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Applies the webdriver patch to a module.
 *
 * The original file is backed up under its own hash before anything is written,
 * so a second run on the same build reuses the backup and a run on a new build
 * creates a separate one instead of overwriting the ability to restore the old
 * install.
 */
export function patchWebdriverFlag(modulePath: string): PatchOutcome {
  const status = getModuleStatus(modulePath);
  if (status.state === 'patched') {
    return { modulePath, changed: false, status };
  }
  if (status.state === 'unrecognized' || !status.site) {
    throw new Error(
      `No patch is known for ${modulePath} (version ${status.build.version ?? 'unknown'}, ` +
        `build ${status.build.buildId ?? 'unknown'}). The file was not modified.`
    );
  }

  const site = status.site;
  const data = readFileSync(modulePath);
  const current = data.subarray(site.fileOffset, site.fileOffset + site.originalBytes.length);
  if (!current.equals(site.originalBytes)) {
    throw new Error(
      `The bytes at offset ${site.fileOffset} are not the ones this patch expects; ` +
        'the file was not modified.'
    );
  }

  const originals = listRecords();
  const backupDir = backupDirFor(status.sha256);
  const recordPath = join(backupDir, RECORD_FILE);
  if (!existsSync(recordPath)) {
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(modulePath, join(backupDir, moduleFileName()));
    logDebug(`Backed up ${modulePath} to ${backupDir}`);
  }
  const backup = join(backupDir, moduleFileName());
  if (sha256(readFileSync(backup)) !== status.sha256) {
    throw new Error(`The backup in ${backupDir} does not match ${modulePath}; nothing was written`);
  }

  try {
    writeInPlace(modulePath, site.fileOffset, PATCH_BYTES);
  } catch (error) {
    throw describeWriteFailure(error, modulePath) ?? error;
  }

  const patchedData = readFileSync(modulePath);
  const written = patchedData.subarray(site.fileOffset, site.fileOffset + PATCH_BYTES.length);
  if (!written.equals(PATCH_BYTES)) {
    throw new Error(`Writing to ${modulePath} did not take effect; restore it from ${backup}`);
  }

  const record: PatchRecord = {
    modulePath,
    originalSha256: status.sha256,
    patchedSha256: sha256(patchedData),
    size: patchedData.length,
    signatureId: site.signatureId,
    fileOffset: site.fileOffset,
    originalBytes: site.originalBytes.toString('hex'),
    patchedBytes: PATCH_BYTES.toString('hex'),
    version: status.build.version,
    buildId: status.build.buildId,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
  logDebug(
    `Patched ${modulePath} at offset ${site.fileOffset} using signature ${site.signatureId}` +
      ` (${originals.length} earlier backup(s))`
  );

  return { modulePath, changed: true, status: getModuleStatus(modulePath) };
}

/**
 * Restores the file a patch replaced.
 *
 * Only the exact file this module produced is restored. When the install has
 * been updated since, the recorded file is gone and putting the old backup back
 * would downgrade the browser, so the caller is told instead.
 */
export function restoreModule(modulePath: string): PatchOutcome {
  const data = readFileSync(modulePath);
  const hash = sha256(data);
  const records = listRecords();
  const patched = records.find((record) => record.patchedSha256 === hash);

  if (!patched) {
    const original = records.find((record) => record.originalSha256 === hash);
    if (original) {
      return { modulePath, changed: false, status: getModuleStatus(modulePath) };
    }
    throw new Error(
      `${modulePath} is not a file this module patched (a browser update replaces it). ` +
        'Nothing was restored.'
    );
  }

  const backup = backupPathFor(patched);
  if (!existsSync(backup)) {
    throw new Error(`The backup for ${modulePath} is missing from ${dirname(backup)}`);
  }
  if (sha256(readFileSync(backup)) !== patched.originalSha256) {
    throw new Error(`The backup ${backup} is not the file ${modulePath} was made from`);
  }

  try {
    copyFileSync(backup, modulePath);
  } catch (error) {
    throw describeWriteFailure(error, modulePath) ?? error;
  }

  const restored = readFileSync(modulePath);
  if (sha256(restored) !== patched.originalSha256) {
    throw new Error(`Restoring ${modulePath} from ${backup} did not reproduce the original file`);
  }
  logDebug(`Restored ${modulePath} from ${backup}`);
  return { modulePath, changed: true, status: getModuleStatus(modulePath) };
}
