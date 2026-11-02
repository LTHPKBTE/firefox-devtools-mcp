/**
 * Stealth Tools
 * Binary-level automation fingerprint removal: the shared library the browser
 * was installed with is edited so navigator.webdriver reads false.
 */

import { existsSync } from 'node:fs';
import { successResponse } from '../utils/response-helpers.js';
import { findFirefoxBinaryWindows } from '../firefox/windows-binary.js';
import {
  backupPathFor,
  getModuleStatus,
  listRecords,
  patchWebdriverFlag,
  resolveModulePath,
  restoreModule,
  type ModuleStatus,
} from '../firefox/stealth.js';
import { defineModule, defineToolHandler, type ToolDefinition } from './module.js';

/**
 * Binary the caller means: an explicit path, else the binary of the running
 * session, else the command line, else a detected install. Patching the wrong
 * install would either fail or, worse, patch a browser nobody is using.
 */
async function resolveBinaryPath(input?: string): Promise<string> {
  if (input) {
    return input;
  }

  const { args, getFirefoxIfRunning } = await import('../index.js');
  const session = getFirefoxIfRunning();
  const sessionBinary = session?.getOptions().firefoxPath ?? session?.getDetectedBinaryPath();
  if (sessionBinary) {
    return sessionBinary;
  }
  if (args.firefoxPath) {
    return args.firefoxPath;
  }
  if (process.platform === 'win32') {
    const detected = findFirefoxBinaryWindows();
    if (detected) {
      return detected;
    }
  }
  throw new Error(
    'No browser binary to work on: pass firefoxPath, or start the browser through this server first.'
  );
}

/** Human-readable summary of one module, shared by the three tools. */
function describeStatus(status: ModuleStatus): string[] {
  const lines = [
    `Binary module: ${status.modulePath}`,
    `Size: ${status.size.toLocaleString('en-US')} bytes`,
    `Version: ${status.build.version ?? '(unknown)'} (build ${status.build.buildId ?? 'unknown'})`,
    `SHA-256: ${status.sha256}`,
    `State: ${status.state}`,
  ];
  if (status.site) {
    lines.push(
      `Patch site: signature ${status.site.signatureId} at offset ${status.site.fileOffset}`
    );
  }
  if (status.record) {
    lines.push(`Backup: ${backupPathFor(status.record)}`);
    lines.push(`Patched at: ${status.record.createdAt}`);
  }
  lines.push(`Backups on disk: ${status.backupCount}`);
  return lines;
}

const fingerprintNote =
  'navigator.webdriver is set by the browser itself, so only the binary decides it: ' +
  'patched reads false, unpatched reads true while an automation session is active.';

// ============================================================================
// Tool: get_stealth_status
// ============================================================================

export const getStealthStatusTool = {
  name: 'get_stealth_status',
  description:
    'Report whether the browser binary is patched to hide the WebDriver flag: module path, ' +
    'version, file hash, patch offset and available backups. ' +
    'Use it before and after patch_navigator_webdriver.',
  annotations: {
    readOnlyHint: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      firefoxPath: {
        type: 'string',
        description:
          'Path to the browser executable. Defaults to the running session, the --firefox-path argument, or a detected install.',
      },
    },
  },
} satisfies ToolDefinition;

export const handleGetStealthStatus = defineToolHandler(async (input: unknown) => {
  const { firefoxPath } = (input ?? {}) as { firefoxPath?: string };
  const binaryPath = await resolveBinaryPath(firefoxPath);
  const modulePath = resolveModulePath(binaryPath);
  if (!existsSync(modulePath)) {
    return successResponse(`No browser library at ${modulePath} (binary: ${binaryPath})`);
  }
  const status = getModuleStatus(modulePath);
  return successResponse([...describeStatus(status), '', fingerprintNote].join('\n'));
});

// ============================================================================
// Tool: patch_navigator_webdriver
// ============================================================================

export const patchNavigatorWebdriverTool = {
  name: 'patch_navigator_webdriver',
  description:
    'Patch the installed browser binary so navigator.webdriver always reads false, and back the ' +
    'original file up first. The browser must be closed; the change applies from the next start. ' +
    'Reading the flag as false is what an anti-automation check looks at.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      firefoxPath: {
        type: 'string',
        description:
          'Path to the browser executable. Defaults to the running session, the --firefox-path argument, or a detected install.',
      },
    },
  },
} satisfies ToolDefinition;

export const handlePatchNavigatorWebdriver = defineToolHandler(async (input: unknown) => {
  const { firefoxPath } = (input ?? {}) as { firefoxPath?: string };
  const binaryPath = await resolveBinaryPath(firefoxPath);
  const modulePath = resolveModulePath(binaryPath);
  if (!existsSync(modulePath)) {
    throw new Error(`No browser library at ${modulePath} (binary: ${binaryPath})`);
  }

  const outcome = patchWebdriverFlag(modulePath);
  const headline = outcome.changed
    ? `Patched ${modulePath}`
    : `${modulePath} was already patched; nothing was written`;
  return successResponse(
    [headline, '', ...describeStatus(outcome.status), '', fingerprintNote].join('\n')
  );
});

// ============================================================================
// Tool: restore_navigator_webdriver
// ============================================================================

export const restoreNavigatorWebdriverTool = {
  name: 'restore_navigator_webdriver',
  description:
    'Undo patch_navigator_webdriver by copying the backup of the original browser library back, ' +
    'which brings navigator.webdriver back. The browser must be closed. ' +
    'After a browser update the installed file is already the vendor one; nothing is restored then.',
  annotations: {
    readOnlyHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      firefoxPath: {
        type: 'string',
        description:
          'Path to the browser executable. Defaults to the running session, the --firefox-path argument, or a detected install.',
      },
    },
  },
} satisfies ToolDefinition;

export const handleRestoreNavigatorWebdriver = defineToolHandler(async (input: unknown) => {
  const { firefoxPath } = (input ?? {}) as { firefoxPath?: string };
  const binaryPath = await resolveBinaryPath(firefoxPath);
  const modulePath = resolveModulePath(binaryPath);
  if (!existsSync(modulePath)) {
    throw new Error(`No browser library at ${modulePath} (binary: ${binaryPath})`);
  }

  const outcome = restoreModule(modulePath);
  const headline = outcome.changed
    ? `Restored the original ${modulePath} from its backup`
    : `${modulePath} holds the original file already; nothing was written`;
  const others = listRecords().filter((record) => record.modulePath !== modulePath);
  const lines = [headline, '', ...describeStatus(outcome.status), '', fingerprintNote];
  if (others.length > 0) {
    lines.push(
      '',
      `Other installs this module has patched (left untouched): ${others
        .map((record) => record.modulePath)
        .join(', ')}`
    );
  }
  return successResponse(lines.join('\n'));
});

export const module = defineModule({
  name: 'stealth',
  description:
    'Remove automation fingerprints by patching the browser binary (navigator.webdriver).',
  mozOnly: true,
  tools: [
    [getStealthStatusTool, handleGetStealthStatus],
    [patchNavigatorWebdriverTool, handlePatchNavigatorWebdriver],
    [restoreNavigatorWebdriverTool, handleRestoreNavigatorWebdriver],
  ],
});
