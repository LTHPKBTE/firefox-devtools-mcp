/**
 * Tests for the standalone stealth command's argument handling.
 *
 * The command is often typed with only the path at hand, e.g.
 * `stealth --firefox-path "C:\Program Files\Waterfox\waterfox.exe"`. Options
 * therefore have to be accepted on either side of the command, and a missing
 * command must not be mistaken for an unknown argument.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { parseArgs, resolveBinaryPath } from '../../../src/stealth-cli.js';
import { removeDir } from '../../helpers/fs.js';

const WATERFOX = String.raw`C:\Program Files\Waterfox\waterfox.exe`;

let scratch: string | undefined;

function scratchDir(): string {
  scratch = mkdtempSync(join(tmpdir(), 'stealth-cli-'));
  return scratch;
}

afterEach(() => {
  if (scratch) {
    removeDir(scratch);
    scratch = undefined;
  }
});

describe('parseArgs', () => {
  it('reads the command first', () => {
    expect(parseArgs(['status'])).toEqual({
      command: 'status',
      firefoxPath: undefined,
      dryRun: false,
      json: false,
      help: false,
    });
  });

  it('accepts an option before the command', () => {
    const options = parseArgs(['--firefox-path', WATERFOX, 'patch']);
    expect(options.command).toBe('patch');
    expect(options.firefoxPath).toBe(WATERFOX);
  });

  it('accepts an option after the command', () => {
    const options = parseArgs(['patch', '--firefox-path', WATERFOX]);
    expect(options.command).toBe('patch');
    expect(options.firefoxPath).toBe(WATERFOX);
  });

  it('accepts --firefox-path=value', () => {
    expect(parseArgs([`--firefox-path=${WATERFOX}`, 'status']).firefoxPath).toBe(WATERFOX);
  });

  it('reports a missing command instead of treating the option as one', () => {
    const options = parseArgs(['--firefox-path', WATERFOX]);
    expect(options.command).toBeUndefined();
    expect(options.help).toBe(false);
  });

  it('keeps a spaced path in one argument', () => {
    const withTrailingSeparator = 'C:\\Program Files\\Waterfox\\';
    expect(parseArgs(['status', '--firefox-path', withTrailingSeparator]).firefoxPath).toBe(
      withTrailingSeparator
    );
  });

  it('throws when --firefox-path has no value', () => {
    expect(() => parseArgs(['status', '--firefox-path'])).toThrow(/needs a path/);
  });

  it('throws on an unknown option', () => {
    expect(() => parseArgs(['status', '--firefox'])).toThrow(/Unknown option: --firefox/);
  });

  it('throws on a second positional argument', () => {
    expect(() => parseArgs(['status', 'patch'])).toThrow(/Unexpected argument: patch/);
  });

  it('accepts help anywhere', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['patch', '-h']).help).toBe(true);
    expect(parseArgs(['patch', '-h']).command).toBe('patch');
  });

  it('collects the flags regardless of order', () => {
    const options = parseArgs(['prune', '--dry-run', '--json', '-h']);
    expect(options).toMatchObject({ command: 'prune', dryRun: true, json: true, help: true });
  });
});

describe('resolveBinaryPath', () => {
  it('returns an explicit executable unchanged', () => {
    expect(resolveBinaryPath(WATERFOX)).toBe(WATERFOX);
  });

  it('finds the executable inside an install directory', () => {
    const dir = scratchDir();
    const binary = join(dir, 'waterfox.exe');
    writeFileSync(binary, '');
    expect(resolveBinaryPath(dir)).toBe(binary);
  });

  it('prefers firefox.exe when the directory holds both', () => {
    const dir = scratchDir();
    writeFileSync(join(dir, 'firefox.exe'), '');
    writeFileSync(join(dir, 'waterfox.exe'), '');
    expect(resolveBinaryPath(dir)).toBe(join(dir, 'firefox.exe'));
  });

  it('rejects a directory without a known executable', () => {
    const dir = scratchDir();
    mkdirSync(join(dir, 'empty'));
    expect(() => resolveBinaryPath(join(dir, 'empty'))).toThrow(/No browser executable/);
  });
});
