#!/usr/bin/env node
// Regression check for issue #2453: RanobeHub (RNBH.org) source retirement.
//
// The site ranobehub.org (and its successor ranobe.space) answers HTTP 451
// "Domain closed" on every route (verified 2026-08-25), so the source is
// retired to .broken.ts following the #1977 precedent. This script checks the
// retirement invariants. It runs from the repo root:
//
//   node tests/regression-2453.mjs
//
// No npm dependencies. Uses node:fs, node:url and node:path only.
//
// RED baseline at base commit e1dcd06 (before the fix): T1 retired file
// present, T1 original file absent, T3 no other plugin claims RNBH.org
// and T4 content checks on a missing file all FAIL; T2x2 pass (exclusions
// already in the tsconfigs). After the fix: all six checks pass.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldFile = path.join(root, 'plugins', 'russian', 'ranobehub.ts');
const retiredFile = path.join(
  root,
  'plugins',
  'russian',
  'ranobehub.broken.ts',
);

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures += 1;
}

// T1 - retirement in place: the .broken.ts file exists, the original is gone.
check('T1 retired file present', existsSync(retiredFile));
check(
  'T1 original file absent',
  !existsSync(oldFile),
  found(oldFile) ? 'old file still present' : 'ok state',
);

// T2 - the compile exclusions in both tsconfig files cover .broken.ts.
for (const cfg of ['tsconfig.json', 'tsconfig.production.json']) {
  let src = null;
  try {
    src = readFileSync(path.join(root, cfg), 'utf8');
  } catch (e) {
    src = '';
  }
  check(
    `T2 ${cfg} excludes ./plugins/**/*.broken.ts`,
    src.includes('./plugins/**/*.broken.ts'),
  );
}

// T3 - no other committed source in the russian folder claims the RNBH.org id
// (guards against a duplicate source sneaking in next to the retired one).
const ruDir = path.join(root, 'plugins', 'russian');
function found(p) {
  try {
    return existsSync(p);
  } catch (e) {
    return false;
  }
}
let claimers = [];
try {
  claimers = readdirSync(ruDir)
    .filter(f => f.endsWith('.ts'))
    .filter(f => f !== 'ranobehub.broken.ts')
    .filter(f =>
      readFileSync(path.join(ruDir, f), 'utf8').includes("'RNBH.org'"),
    );
} catch (e) {
  claimers = ['<plugins/russian unreadable>'];
}
check(
  'T3 no other plugin claims RNBH.org',
  claimers.length === 0,
  claimers.join(', '),
);

// T4 - the retired file still documents the closed source lineage (id, name,
// site). Guarded: if the file is missing (RED state), report FAIL without
// crashing on the read.
if (existsSync(retiredFile)) {
  const src = readFileSync(retiredFile, 'utf8');
  const docOk =
    src.includes("id = 'RNBH.org'") &&
    src.includes("name = 'RanobeHub'") &&
    src.includes("site = 'https://ranobehub.org'");
  check('T4 retired file documents id/name/site', docOk);
} else {
  check(
    'T4 retired file documents id/name/site',
    false,
    'file missing (pre-rename)',
  );
}

console.log(
  failures === 0 ? '\nALL CHECKS PASS' : `\n${failures} CHECK(S) FAILED`,
);
process.exitCode = failures === 0 ? 0 : 1;
