'use strict';
// Hash grep gate. Fails (exit 1) if any deprecated template-hash prefix
// appears anywhere in the repo outside TEMPLATE-HASHES.json.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'TEMPLATE-HASHES.json'), 'utf8'));
const PREFIXES = pins.deprecated_hash_prefixes || [];
const CANONICAL = Object.values(pins.contracts).map((c) => c.template_hash);

const ALLOWED_FILES = new Set([
  'TEMPLATE-HASHES.json',
  'tools/check-deprecated-hashes.js'
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', '.build']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.isFile()) out.push(path.join(dir, e.name));
  }
  return out;
}

let bad = 0;
const files = walk(ROOT, []);
for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (ALLOWED_FILES.has(rel)) continue;
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  for (const pfx of PREFIXES) {
    if (text.includes(pfx)) {
      console.log('FAIL deprecated hash prefix ' + pfx + ' in ' + rel);
      bad = 1;
    }
  }
}
const allow = (pins.allowlist && pins.allowlist.factory || []).concat(
  pins.allowlist && pins.allowlist.edition || [],
  pins.allowlist && pins.allowlist.escrow || []
);
const allowSet = new Set(allow);
if (allow.length !== 3 || !CANONICAL.every((h) => allowSet.has(h))) {
  console.log('FAIL indexer allowlist must contain exactly the three canonical hashes');
  bad = 1;
} else {
  console.log('PASS indexer allowlist == the three canonical hashes');
}
console.log(bad ? 'DEPRECATED-HASH GATE FAILED' : 'DEPRECATED-HASH GATE OK');
process.exit(bad);
