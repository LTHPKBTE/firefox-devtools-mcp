/**
 * Unit tests for the binary stealth patches.
 *
 * The signature is the part worth testing: a false match would patch unrelated
 * code, and a patched file must be recognizable again so it can be restored.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { removeDir } from '../../helpers/fs.js';

const MOCK_HOME = join(tmpdir(), 'stealth-test-home');

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => MOCK_HOME };
});

import {
  PATCH_BYTES,
  WEBDRIVER_SIGNATURES,
  backupPathFor,
  findPattern,
  getModuleStatus,
  hexPattern,
  listRecords,
  locatePatchSite,
  moduleFileName,
  parseIni,
  patchWebdriverFlag,
  readBuildInfo,
  resolveModulePath,
  restoreModule,
  sha256,
} from '../../../src/firefox/stealth.js';

const SIGNATURE = WEBDRIVER_SIGNATURES[0];
if (!SIGNATURE) {
  throw new Error('expected at least one webdriver signature');
}

/** A buffer holding the signature once, with dummy relocation values. */
function fakeModule(offset = 0x100, size = 0x400): Buffer {
  const data = Buffer.alloc(size, 0x90);
  SIGNATURE.pattern.forEach((byte, index) => {
    data[offset + index] = byte ?? 0x11;
  });
  return data;
}

describe('hexPattern', () => {
  it('turns wildcards into nulls and hex into bytes', () => {
    expect(hexPattern('56 ?? 48')).toEqual([0x56, null, 0x48]);
  });
});

describe('findPattern', () => {
  it('finds the pattern once in a module that holds it once', () => {
    expect(findPattern(fakeModule(), SIGNATURE.pattern)).toEqual([0x100]);
  });

  it('ignores differing wildcard bytes', () => {
    const data = fakeModule();
    // Every masked position changes, which a rebuild does to displacements.
    SIGNATURE.pattern.forEach((byte, index) => {
      if (byte === null) {
        data[0x100 + index] = 0xa5;
      }
    });
    expect(findPattern(data, SIGNATURE.pattern)).toEqual([0x100]);
  });

  it('reports every occurrence', () => {
    const data = fakeModule();
    SIGNATURE.pattern.forEach((byte, index) => {
      data[0x200 + index] = byte ?? 0x22;
    });
    expect(findPattern(data, SIGNATURE.pattern)).toEqual([0x100, 0x200]);
  });

  it('finds nothing in unrelated bytes', () => {
    expect(findPattern(Buffer.alloc(0x400, 0x00), SIGNATURE.pattern)).toEqual([]);
  });
});

describe('locatePatchSite', () => {
  it('returns the offset and the bytes it would overwrite', () => {
    const site = locatePatchSite(fakeModule());
    expect(site.signatureId).toBe(SIGNATURE.id);
    expect(site.fileOffset).toBe(0x100);
    expect(site.originalBytes.toString('hex')).toBe('565755');
  });

  it('refuses a build where the site is ambiguous', () => {
    const data = fakeModule();
    SIGNATURE.pattern.forEach((byte, index) => {
      data[0x200 + index] = byte ?? 0x22;
    });
    expect(() => locatePatchSite(data)).toThrow(/ambiguous|matches 2 places/);
  });

  it('refuses an unknown build', () => {
    expect(() => locatePatchSite(Buffer.alloc(0x400, 0x00))).toThrow(/not recognized/);
  });

  it('cannot recognize a patched site, which is why the record matters', () => {
    const data = fakeModule();
    PATCH_BYTES.copy(data, 0x100);
    expect(() => locatePatchSite(data)).toThrow(/not recognized/);
  });
});

describe('parseIni', () => {
  it('reads sections and trims values', () => {
    const sections = parseIni('[Build]\nBuildID=20261027085606\nMilestone = 153.6.0\n; comment\n');
    expect(sections['Build']).toEqual({ BuildID: '20261027085606', Milestone: '153.6.0' });
  });
});

describe('resolveModulePath', () => {
  it('puts the module next to the executable', () => {
    const binary = join(tmpdir(), 'install', 'browser.exe');
    expect(resolveModulePath(binary)).toBe(join(dirname(binary), moduleFileName()));
  });
});

describe('patching an installed module', () => {
  const installDir = join(tmpdir(), `stealth-install-${process.pid}`);
  const modulePath = join(installDir, moduleFileName());
  let original: Buffer;

  beforeEach(() => {
    removeDir(MOCK_HOME);
    removeDir(installDir);
    mkdirSync(installDir, { recursive: true });
    writeFileSync(
      join(installDir, 'platform.ini'),
      '[Build]\nBuildID=20261027085606\nMilestone=153.6.0\n',
      'utf-8'
    );
    original = fakeModule();
    writeFileSync(modulePath, original);
  });

  afterEach(() => {
    removeDir(MOCK_HOME);
    removeDir(installDir);
  });

  it('reports an installed, unpatched build', () => {
    const status = getModuleStatus(modulePath);
    expect(status.state).toBe('unpatched');
    expect(status.build).toEqual({ version: '153.6.0', buildId: '20261027085606' });
    expect(status.sha256).toBe(sha256(original));
  });

  it('patches the site, backs the file up and records what it did', () => {
    const outcome = patchWebdriverFlag(modulePath);
    expect(outcome.changed).toBe(true);
    expect(outcome.status.state).toBe('patched');

    const patched = readFileSync(modulePath);
    expect(patched.subarray(0x100, 0x103).equals(PATCH_BYTES)).toBe(true);
    expect(patched.length).toBe(original.length);

    const [record] = listRecords();
    if (!record) {
      throw new Error('expected the patch to leave a record');
    }
    expect(record.originalSha256).toBe(sha256(original));
    expect(record.patchedSha256).toBe(sha256(patched));
    expect(record.fileOffset).toBe(0x100);
    expect(existsSync(backupPathFor(record))).toBe(true);
    expect(readFileSync(backupPathFor(record)).equals(original)).toBe(true);
  });

  it('is idempotent', () => {
    patchWebdriverFlag(modulePath);
    const again = patchWebdriverFlag(modulePath);
    expect(again.changed).toBe(false);
    expect(again.status.state).toBe('patched');
    expect(listRecords()).toHaveLength(1);
  });

  it('restores the original file from the backup', () => {
    patchWebdriverFlag(modulePath);
    const restored = restoreModule(modulePath);
    expect(restored.changed).toBe(true);
    expect(restored.status.state).toBe('unpatched');
    expect(readFileSync(modulePath).equals(original)).toBe(true);
  });

  it('does not restore over a file the browser update replaced', () => {
    patchWebdriverFlag(modulePath);
    const updated = fakeModule(0x180, 0x400);
    writeFileSync(modulePath, updated);
    expect(() => restoreModule(modulePath)).toThrow(/not a file this module patched/);
    expect(readFileSync(modulePath).equals(updated)).toBe(true);
  });

  it('reports a new build of the same product as patchable, then patches it', () => {
    patchWebdriverFlag(modulePath);
    const updated = fakeModule(0x200, 0x400);
    writeFileSync(modulePath, updated);
    const status = getModuleStatus(modulePath);
    expect(status.state).toBe('unpatched');
    expect(status.site?.fileOffset).toBe(0x200);

    const outcome = patchWebdriverFlag(modulePath);
    expect(outcome.changed).toBe(true);
    // The earlier backup is kept, so the previous install stays restorable.
    expect(listRecords()).toHaveLength(2);
  });

  it('reports a build it does not know', () => {
    writeFileSync(modulePath, Buffer.alloc(0x400, 0x00));
    expect(getModuleStatus(modulePath).state).toBe('unrecognized');
    expect(() => patchWebdriverFlag(modulePath)).toThrow(/No patch is known/);
  });

  it('records the build markers of the install it patched', () => {
    patchWebdriverFlag(modulePath);
    expect(readBuildInfo(installDir)).toEqual({ version: '153.6.0', buildId: '20261027085606' });
  });
});
