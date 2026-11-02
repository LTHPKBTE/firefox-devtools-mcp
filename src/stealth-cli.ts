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

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  --firefox-path <path>  Browser executable, or the install directory holding it
                         (default: detected Firefox install)
  --dry-run              With prune: list what would be deleted, delete nothing
  --json                 Print the result as JSON

Options may come before or after the command. Paths with spaces need quotes.

Examples:
  stealth status
  stealth patch --firefox-path "C:\\Program Files\\Waterfox\\waterfox.exe"

Undoing the patch:
  Run restore, then prune. One backup is kept on purpose: the one belonging to
  the file now installed, because restore needs it. Delete the stealth
  directory under ~/.firefox-devtools-mcp to remove it as well.
`;

interface Options {
  command: string | undefined;
  firefoxPath: string | undefined;
  dryRun: boolean;
  json: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: undefined,
    firefoxPath: undefined,
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--firefox-path') {
      const value = argv[++i];
      if (!value) {
        throw new Error('--firefox-path needs a path');
      }
      options.firefoxPath = value;
    } else if (arg.startsWith('--firefox-path=')) {
      const value = arg.slice('--firefox-path='.length);
      if (!value) {
        throw new Error('--firefox-path needs a path');
      }
      options.firefoxPath = value;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (options.command === undefined) {
      options.command = arg;
    } else {
      throw new Error(
        `Unexpected argument: ${arg} (the command is already ${options.command}; quote paths that contain spaces)`
      );
    }
  }
  return options;
}

/** Executable names to look for when an install directory is passed instead of a file. */
const WINDOWS_EXECUTABLES = ['firefox.exe', 'waterfox.exe'];

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The install to work on. Nothing is inferred beyond the browser this platform
 * can find, because patching the wrong install fails confusingly at best.
 */
export function resolveBinaryPath(explicit: string | undefined): string {
  if (explicit) {
    if (!isDirectory(explicit)) {
      return explicit;
    }
    const found = WINDOWS_EXECUTABLES.map((name) => join(explicit, name)).find((candidate) =>
      existsSync(candidate)
    );
    if (!found) {
      throw new Error(
        `No browser executable in ${explicit} (looked for ${WINDOWS_EXECUTABLES.join(', ')})`
      );
    }
    return found;
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
  const command = options.command;
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === undefined) {
    process.stderr.write(`stealth: no command given\n\n${USAGE}`);
    return 1;
  }

  const binaryPath = resolveBinaryPath(options.firefoxPath);
  const modulePath = resolveModulePath(binaryPath);
  if (command !== 'prune' && !existsSync(modulePath)) {
    throw new Error(`No browser module at ${modulePath} (binary: ${binaryPath})`);
  }

  if (command === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === 'status') {
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

  if (command === 'patch') {
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

  if (command === 'restore') {
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

  if (command === 'prune') {
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

  throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
}

/**
 * Only run when started as a program: the parser is unit-tested by importing
 * this module, which must not execute a command on the way in.
 */
function startedAsProgram(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (startedAsProgram()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`stealth: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
