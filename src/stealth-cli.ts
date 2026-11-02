#!/usr/bin/env node
/**
 * Standalone command for the binary stealth patch.
 *
 * Patching an installed browser rewrites a file under Program Files, which needs
 * elevation that the MCP server normally does not have. Doing it from a shell
 * the user starts as administrator keeps the server unprivileged, and works
 * while no browser session exists. The command imports only the patch module, so
 * it starts without the server, the browser, or an MCP client.
 *
 * The patch is also available as MCP tools for the `all` preset; the two front
 * ends share the same implementation.
 */

import { existsSync } from 'node:fs';
import { findFirefoxBinaryWindows } from './firefox/windows-binary.js';
import {
  backupPathFor,
  getModuleStatus,
  listRecords,
  patchWebdriverFlag,
  pruneBackups,
  resolveModulePath,
  restoreModule,
  type ModuleStatus,
} from './firefox/stealth.js';

const USAGE = `Usage: stealth <command> [options]

Commands:
  status    Report whether the installed browser module is patched
  patch     Back the module up, then make navigator.webdriver read false
  restore   Copy the backup over the module again
  prune     Delete backups other than the one for the current install

Options:
  --firefox-path <path>  Browser executable to work on (default: detected Firefox install)
  --dry-run              With prune: list what would be deleted, delete nothing
  --json                 Print the result as JSON

Undoing the patch:
  Run restore, then prune. One backup is kept on purpose: the one belonging to
  the file now installed, because restore needs it. Delete the stealth
  directory under ~/.firefox-devtools-mcp to remove it as well.
`;

interface Options {
  command: string;
  firefoxPath: string | undefined;
  dryRun: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: argv[0] ?? 'help',
    firefoxPath: undefined,
    dryRun: false,
    json: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--firefox-path') {
      const value = argv[++i];
      if (!value) {
        throw new Error('--firefox-path needs a path');
      }
      options.firefoxPath = value;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

/**
 * The install to work on. Nothing is inferred beyond the browser this platform
 * can find, because patching the wrong install fails confusingly at best.
 */
function resolveBinaryPath(explicit: string | undefined): string {
  if (explicit) {
    return explicit;
  }
  if (process.platform === 'win32') {
    const detected = findFirefoxBinaryWindows();
    if (detected) {
      return detected;
    }
  }
  throw new Error('Pass --firefox-path <path to the browser executable>.');
}

function describeStatus(status: ModuleStatus): string[] {
  const lines = [
    `Module: ${status.modulePath}`,
    `Version: ${status.build.version ?? '(unknown)'} (build ${status.build.buildId ?? 'unknown'})`,
    `State: ${status.state}`,
    `SHA-256: ${status.sha256}`,
  ];
  if (status.site) {
    lines.push(
      `Patch site: signature ${status.site.signatureId} at offset ${status.site.fileOffset}`
    );
  }
  if (status.record) {
    lines.push(`Backup: ${backupPathFor(status.record)}`);
  }
  lines.push(`Backups on disk: ${status.backupCount}`);
  return lines;
}

function main(argv: string[]): number {
  const options = parseArgs(argv);
  if (options.command === 'help' || options.command === '--help' || options.command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  const binaryPath = resolveBinaryPath(options.firefoxPath);
  const modulePath = resolveModulePath(binaryPath);
  if (options.command !== 'prune' && !existsSync(modulePath)) {
    throw new Error(`No browser module at ${modulePath} (binary: ${binaryPath})`);
  }

  if (options.command === 'status') {
    const status = getModuleStatus(modulePath);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    } else {
      process.stdout.write(`${describeStatus(status).join('\n')}\n`);
      const others = listRecords().filter((record) => record.modulePath !== modulePath);
      if (others.length > 0) {
        process.stdout.write(`Other installs recorded: ${others.length} (see prune)\n`);
      }
    }
    return 0;
  }

  if (options.command === 'patch') {
    const outcome = patchWebdriverFlag(modulePath);
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ changed: outcome.changed, status: outcome.status }, null, 2)}\n`
      );
    } else {
      const headline = outcome.changed
        ? `Patched ${modulePath}; restart the browser for navigator.webdriver to read false.`
        : `${modulePath} was already patched; nothing was written.`;
      process.stdout.write(`${headline}\n${describeStatus(outcome.status).join('\n')}\n`);
    }
    return 0;
  }

  if (options.command === 'restore') {
    const outcome = restoreModule(modulePath);
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ changed: outcome.changed, status: outcome.status }, null, 2)}\n`
      );
    } else {
      const headline = outcome.changed
        ? `Restored ${modulePath} from its backup; restart the browser.`
        : `${modulePath} already holds the original file; nothing was written.`;
      process.stdout.write(`${headline}\n${describeStatus(outcome.status).join('\n')}\n`);
    }
    return 0;
  }

  if (options.command === 'prune') {
    const outcome = pruneBackups(modulePath, { dryRun: options.dryRun });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    } else {
      const verb = outcome.dryRun ? 'Would remove' : 'Removed';
      process.stdout.write(`Keeping ${outcome.kept.length} backup(s):\n`);
      for (const record of outcome.kept) {
        process.stdout.write(`  ${backupPathFor(record)} (${record.version ?? 'unknown build'})\n`);
      }
      process.stdout.write(`${verb} ${outcome.removed.length} other backup(s)\n`);
      for (const record of outcome.removed) {
        process.stdout.write(`  ${record.modulePath} (${record.version ?? 'unknown build'})\n`);
      }
      if (outcome.removedLeftovers.length > 0) {
        process.stdout.write(`${verb} ${outcome.removedLeftovers.length} leftover(s)\n`);
      }
    }
    return 0;
  }

  throw new Error(`Unknown command: ${options.command}\n\n${USAGE}`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`stealth: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
