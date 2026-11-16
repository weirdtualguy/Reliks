#!/usr/bin/env node
// Generate silverc constructor args (12 arguments) for contracts/SeriesFactory.sil
// from a Reliks-VM program (.hex or assembly/DSL .txt) and a series config (.json).
//
// Usage:
//   node cli/gen-factory-args.js <series.json> [out.json]
//   PROG_FILE=web/vm-templates/iso.txt node cli/gen-factory-args.js <series.json> [out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'vm', 'rvm.js'));
const A = require(path.join(ROOT, 'web', 'rvm-asm.js'));
const b2 = (u) => require(path.join(ROOT, 'web', 'blake2b.js')).blake2b(u, 32);
const hx = (u) => Buffer.from(u).toString('hex');
const die = (m) => { console.error('FATAL: ' + m); process.exit(1); };

const [,, cfgPath, outArg] = process.argv;
if (!cfgPath) die('usage: node cli/gen-factory-args.js <series.json> [out.json]');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

if (!/^[0-9a-fA-F]{64}$/.test(cfg.artist || '')) die('artist must be a 64-hex x-only pubkey');
for (const k of ['price', 'royalty_bips', 'mints_left']) if (!Number.isSafeInteger(cfg[k])) die(k + ' must be an integer');
if (cfg.price < 100000000) die('price must be >= 100000000 sompi (1 KAS) — no free mints');
if (cfg.royalty_bips < 500 || cfg.royalty_bips > 2000) die('royalty_bips must be in [500, 2000] (5% to 20%)');
if (cfg.mints_left < 1) die('mints_left must be >= 1');

const progFile = process.env.PROG_FILE || process.env.PROG_HEX_FILE || cfg.program || path.join(ROOT, 'vm', 'asm-corpus', 'dagcity_clean.txt');
const raw = fs.readFileSync(path.resolve(progFile), 'utf8').trim();
const progBuf = (/^[0-9a-fA-F\s]+$/.test(raw) && /^52564d01/i.test(raw.replace(/\s+/g, '')))
  ? Buffer.from(raw.replace(/\s+/g, ''), 'hex')
  : Buffer.from(A.assemble(raw));
const cap = Number(process.env.RELIKS_ENGINE_CAP || 25641);
if (progBuf.length > cap) die('program is ' + progBuf.length + ' B, over cap ' + cap + ' B');

const progHash = hx(b2(new Uint8Array(progBuf)));
const hi = R.hostInputs(b2, 1, new Uint8Array(32), 0);
const svg = R.render(new Uint8Array(progBuf), hi.lanes, hi.serial32, hi.pat, hi.wear);
const renderHash = hx(b2(new Uint8Array(Buffer.from(svg, 'ascii'))));

const edAbi = JSON.parse(fs.readFileSync(path.join(ROOT, process.env.RELIKS_EDITION_ABI || 'contracts/edition.json'), 'utf8'));
const ed = edAbi.contracts[Object.keys(edAbi.contracts)[0]].compiled;
const bc = Buffer.from(ed.bytecode);
const prefix = bc.subarray(0, ed.state_span.offset);
const suffix = bc.subarray(ed.state_span.offset + ed.state_span.len);
const tplHash = Array.isArray(ed.template_hash) ? Buffer.from(ed.template_hash) : Buffer.from(ed.template_hash, 'hex');

const bytes = (b) => ({ kind: 'bytes', value: Array.from(b) });
const int = (n) => ({ kind: 'int', value: n });
const engineLang = Number(process.env.ENGINE_LANG || 2);
const args = [
  bytes(Buffer.from(progHash, 'hex')),       // 0 init_program_hash
  bytes(Buffer.from(cfg.artist, 'hex')),     // 1 init_artist
  int(cfg.price),                            // 2 init_price
  int(cfg.royalty_bips),                     // 3 init_royalty_bips
  int(cfg.mints_left),                       // 4 init_mints_left
  bytes(progBuf),                            // 5 engine_code
  int(engineLang),                           // 6 init_engine_lang (2 = Reliks-VM)
  bytes(Buffer.from(renderHash, 'hex')),     // 7 init_render_hash
  bytes(prefix),                             // 8 edition_template_prefix
  bytes(suffix),                             // 9 edition_template_suffix
  bytes(tplHash),                            // 10 expected_template_hash
  int(cfg.next_serial ?? 0)                  // 11 init_next_serial
];

const out = outArg || path.join(ROOT, 'data', 'factory-args.json');
fs.writeFileSync(out, JSON.stringify(args));
console.log('wrote ' + out + ' | program ' + progBuf.length + ' B | program_hash ' + progHash.slice(0, 16) + '... | render_hash ' + renderHash.slice(0, 16) + '... | engine_lang ' + engineLang);
