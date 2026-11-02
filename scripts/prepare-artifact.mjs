#!/usr/bin/env node
/**
 * Assembles the package a CI run hands out: the all-tools build as `dist/`,
 * plus the metadata npm needs to install the external dependencies. The layout
 * matches the Release archive, so the same commands work on both.
 *
 * Uploading `dist.moz/` alone is not enough: the entry point imports
 * `selenium-webdriver` and `yargs` at runtime, so it needs a `package.json`
 * next to it before `npm install --omit=dev` can do anything.
 */

import { readFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist-package');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(resolve(root, 'dist.moz'), resolve(outDir, 'dist'), { recursive: true });
for (const file of [
  'package.json',
  'README.md',
  'README.zh-CN.md',
  'LICENSE-MIT',
  'LICENSE-APACHE',
]) {
  cpSync(resolve(root, file), resolve(outDir, file));
}

console.log(`Assembled ${outDir} for ${pkg.name}@${pkg.version}`);
