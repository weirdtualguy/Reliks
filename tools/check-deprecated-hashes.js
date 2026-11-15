'use strict';
// Hash grep gate. Fails (exit 1) if any deprecated template-hash prefix
// appears anywhere in the repo outside archive/ and the audit docs.
// The prefixes come from TEMPLATE-HASHES.json (deprecated_hash_prefixes).
// Allowed locations for the prefixes:
//   - archive/ (retired contracts + their README, which lists the prefixes)
//   - AUDIT-VERIFY-20261114.md, IN01-FOLLOWUP-FOR-CLAUDE.md,
//     IN03-FOLLOWUP-FOR-CLAUDE.md (the audit record)
//   - TEMPLATE-HASHES.json itself (it lists the prefixes as data)
//   - this file (it lists the prefixes to search for)
// Everything else — code, deploy scripts, the indexer, the site, the ABIs
// in data/ — must not name a deprecated hash. The indexer allowlist must
// contain exactly the three canonical hashes (see TEMPLATE-HASHES.json).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'TEMPLATE-HASHES.json'), 'utf8'));
const PREFIXES = pins.deprecated_hash_prefixes || [];
const CANONICAL = Object.values(pins.contracts).map((c) => c.template_hash);

const ALLOWED_FILES = new Set([
  'AUDIT-VERIFY-20261114.md',
  'IN01-FOLLOWUP-FOR-CLAUDE.md',
  'IN03-FOLLOWUP-FOR-CLAUDE.md',
  'TEMPLATE-HASHES.json',
  'tools/check-deprecated-hashes.js',
  // The canonical escrow's own verified header names the superseded hashes
  // (8eff7679, 07362054, 9fb49e51, b37aa685) as a warning. Contract code and
  // comments must never be edited after verification, so these two files
  // are allowed to mention them. The gate still catches the hashes anywhere
  // else they could be *used* (ABIs, templates, allowlists, deploy scripts).
  'contracts/OfferEscrow.sil',
  'audit-test/v13-fixed/OfferEscrow-v6-fixed.sil',
  // The IN-03 attack script proves the hole against the vulnerable escrow
  // (07362054). It is test evidence, not a deployable reference.
  'audit-test/v13-fixed/in03-attack-fixed.js',
  // Generated site output. The source of the embedded demo data is
  // v13/provenance-v13-demo.json (below); the site is rebuilt by npm run site.
  'docs/index.html',
  'docs/studio.html',
  // Testnet-10 demo provenance (the v13 demo edition, dcdcd59b). Demo data,
  // not a mainnet contract. The demo is not in the indexer allowlist.
  'v13/provenance-v13-demo.json',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', '.build', 'archive']);

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
  try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; } // binary / unreadable: skip
  for (const p of PREFIXES) {
    if (text.includes(p)) {
      console.log('FAIL deprecated hash prefix ' + p + ' in ' + rel);
      bad = 1;
    }
  }
}
// The indexer allowlist must contain exactly the three canonical hashes.
const allow = (pins.allowlist && pins.allowlist.factory || []).concat(
  pins.allowlist && pins.allowlist.edition || [],
  pins.allowlist && pins.allowlist.escrow || [],
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
