#!/usr/bin/env node
// Generate silverc constructor args for SeriesFactory-v12 from a small series config.
//
//   node gen-factory-args.js series.json [out.json]
//
// series.json: { "artist": "<64-hex x-only pubkey>", "price": 100000000,
//                "royalty_bips": 500, "mints_left": 8 }
//
// Env: RELIKS_ENGINE  engine module (default ./reliks-engine-mainnet.js)
//      RELIKS_ENGINE_CAP  max engine bytes (default 25641; PUSHDATA2 ceiling, see docs)
//
// Arg order mirrors the SeriesFactory constructor in sil/SeriesFactory-v12.sil.
// Validation mirrors the on-chain requires so a dead series can't be baked.
'use strict';
const fs = require('fs');
const path = require('path');
const { blake2b } = require('@noble/hashes/blake2b');

const MIN_PRICE = 100000000;   // 1 KAS carrier floor (SeriesFactory MIN_PRICE)
const MAX_ROYALTY_BIPS = 2000; // SeriesFactory MAX_ROYALTY_BIPS
const ENGINE_LANG = 0;         // 0 = integer-only SVG

function die(msg) { console.error('FATAL: ' + msg); process.exit(1); }

const [,, cfgPath, outArg] = process.argv;
if (!cfgPath) die('usage: node gen-factory-args.js series.json [out.json]');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

if (!/^[0-9a-fA-F]{64}$/.test(cfg.artist || '')) die('artist must be a 64-hex x-only pubkey');
for (const k of ['price', 'royalty_bips', 'mints_left']) if (!Number.isSafeInteger(cfg[k])) die(k + ' must be an integer');
if (cfg.price !== 0 && cfg.price < MIN_PRICE) die('price must be 0 or >= ' + MIN_PRICE + ' sompi (1 KAS)');
if (cfg.royalty_bips < 1 || cfg.royalty_bips > MAX_ROYALTY_BIPS) die('royalty_bips must be in [1, ' + MAX_ROYALTY_BIPS + '] (0% editions are unsellable)');
if (cfg.mints_left < 1) die('mints_left must be >= 1');

const enginePath = process.env.RELIKS_ENGINE || './reliks-engine-mainnet.js';
const ENGINE = require(path.resolve(enginePath));
const engineBytes = Buffer.from(ENGINE.ENGINE_SRC, 'utf8');
const cap = Number(process.env.RELIKS_ENGINE_CAP || 25641);
if (engineBytes.length > cap) die('engine is ' + engineBytes.length + ' B, over cap ' + cap + ' B');

// Edition template (prefix/suffix/hash) comes from the compiled edition ABI.
const edAbi = JSON.parse(fs.readFileSync('data/edition-abi-v12.json', 'utf8'));
const ed = edAbi.contracts[Object.keys(edAbi.contracts)[0]].compiled;
const bc = Buffer.from(ed.bytecode);
const prefix = bc.subarray(0, ed.state_span.offset);
const suffix = bc.subarray(ed.state_span.offset + ed.state_span.len);
const tplHash = Array.isArray(ed.template_hash) ? Buffer.from(ed.template_hash) : Buffer.from(ed.template_hash, 'hex');

const bytes = b => ({ kind: 'bytes', value: Array.from(b) });
const int = n => ({ kind: 'int', value: n });
const args = [
  bytes(Buffer.from(blake2b(engineBytes, { dkLen: 32 }))),          // 0 init_program_hash
  bytes(Buffer.from(cfg.artist, 'hex')),                            // 1 init_artist
  int(cfg.price),                                                   // 2 init_price
  int(cfg.royalty_bips),                                            // 3 init_royalty_bips
  int(cfg.mints_left),                                              // 4 init_mints_left
  bytes(engineBytes),                                               // 5 engine_code
  int(ENGINE_LANG),                                                 // 6 init_engine_lang
  bytes(Buffer.from(ENGINE.renderHashHex, 'hex')),                  // 7 init_render_hash
  bytes(prefix),                                                    // 8 edition_template_prefix
  bytes(suffix),                                                    // 9 edition_template_suffix
  bytes(tplHash),                                                   // 10 expected_template_hash
];

const out = outArg || 'data/factory-args-v12.json';
fs.writeFileSync(out, JSON.stringify(args));
console.log('wrote ' + out + ' | engine ' + engineBytes.length + ' B | engine_hash ' + ENGINE.engineHashHex + ' | render_hash ' + ENGINE.renderHashHex);
console.log('next: silverc compile sil/SeriesFactory-v12.sil with these args -> data/factory-abi-v12.json, then node deploy-v12.js');
