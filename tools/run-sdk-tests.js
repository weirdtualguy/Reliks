#!/usr/bin/env node
// Runs every sdk/test-*.js sequentially (network-free; ledger-dependent tests print SKIP). Exits 1 if any fails.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dir = path.join(__dirname, '..', 'sdk');
const files = fs.readdirSync(dir).filter((f) => /^test-.*\.js$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 120000 });
  const last = String(r.stdout || '').trim().split('\n').pop();
  if (r.status !== 0) { failed++; console.log('FAIL sdk/' + f + '\n' + String(r.stdout || '').split('\n').filter((l) => /^FAIL/.test(l)).slice(0, 5).join('\n') + '\n' + String(r.stderr || '').slice(0, 400)); }
  else console.log('PASS sdk/' + f + ' | ' + last.slice(0, 70));
}
console.log('\nsdk tests: ' + (files.length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
