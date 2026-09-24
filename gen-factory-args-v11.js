const fs = require('fs');
if (!process.env.RELIKS_ENGINE) { console.error('FATAL: RELIKS_ENGINE env var is required. No default engine.'); process.exit(1); }
const ENGINE = require(process.env.RELIKS_ENGINE);
const cfg = JSON.parse(fs.readFileSync(process.argv[2] || 'data/series-testnet-v11.json', 'utf8'));
// E-1 GUARD (audit): royalty_bips == 0 bricks paid secondary sales.
// ReliksEdition.checkPayments requires tx.outputs[artistOutIdx].value == roy;
// with bips == 0, roy == 0, and zero-value outputs are consensus-invalid, so
// a listed 0% edition could never be bought or sold with price (unlist,
// transfer and sell-at-0 still work). Enforce [1,2000] here, at the only
// writable entry point; templates are frozen. Escape hatch: --allow-otc-only
// bakes a 0% series with a loud warning (OTC-only by design).
if (Number.isInteger(cfg.royalty_bips) === false || cfg.royalty_bips < 0 || cfg.royalty_bips > 2000) {
  console.error('E-1 GUARD: royalty_bips must be an integer in [0,2000]; got: ' + cfg.royalty_bips);
  process.exit(1);
}
if (cfg.royalty_bips === 0) {
  console.error("E-1 GUARD: royalty_bips=0 is forbidden. The factory contract requires >= 1. A 0% series would brick on mint.");
  process.exit(1);
}
// F-M2 GUARD (audit): price and mints_left are constant-folded at deploy; a dead
// configuration bakes a series where every mint reverts (recoverable only via close()).
// Factory invariants: require(price == 0 || price >= MINT_FEE) and mints_left > 0.
if (Number.isInteger(cfg.price) === false || cfg.price < 0) {
  console.error('F-M2 GUARD: price must be a non-negative integer (sompi); got: ' + cfg.price);
  process.exit(1);
}
if (cfg.price !== 0 && cfg.price < 100000000) {
  console.error('F-M2 GUARD: refusing to bake 0 < price < 1 KAS (100000000 sompi).');
  console.error('Reason: factory mint requires price == 0 || price >= MINT_FEE; a positive sub-1-KAS price makes every mint revert (dead series).');
  console.error('Fix: set price to 0 (free series) or >= 100000000 sompi.');
  process.exit(1);
}
if (Number.isInteger(cfg.mints_left) === false || cfg.mints_left < 1) {
  console.error('F-M2 GUARD: mints_left must be an integer >= 1; got: ' + cfg.mints_left);
  process.exit(1);
}
const ed = JSON.parse(fs.readFileSync('data/edition-abi-v6.json', 'utf8'));
const c = ed.contracts[Object.keys(ed.contracts)[0]];
const bc = Buffer.from(c.compiled.bytecode);
const off = c.compiled.state_span.offset, len = c.compiled.state_span.len;
const prefix = bc.subarray(0, off), suffix = bc.subarray(off + len);
const hash = Buffer.from(c.compiled.template_hash);
const B = (b) => ({ kind: 'bytes', value: Array.from(b) });
const I = (n) => ({ kind: 'int', value: n });
const args = [
  B(Buffer.from(require('@noble/hashes/blake2b').blake2b(Buffer.from(ENGINE.ENGINE_SRC, 'utf8'), { dkLen: 32 }))), // program_hash (recomputed)
  B(Buffer.from(cfg.artist, 'hex')),                    // artist
  I(cfg.price),                                         // price (0 = free series)
  I(cfg.royalty_bips),                                  // royalty (cap 2000 enforced at mint)
  I(cfg.mints_left),                                    // supply (artist's choice)
  B(Buffer.from(ENGINE.ENGINE_SRC, 'utf8')),            // engine_code
  I(0),                                                 // engine_lang
  B(Buffer.from(ENGINE.renderHashHex, 'hex')),          // render_hash
  B(Buffer.from(cfg.treasury, 'hex')),                  // treasury (platform revenue key)
  B(prefix), B(suffix), B(hash)                         // edition template v11
];
fs.writeFileSync((process.env.RELIKS_ARGS || 'data/factory-args-v11.json'), JSON.stringify(args, null, 2));
console.log('factory-args-v11.json written | edition template hash', hash.toString('hex'), '| prefix/suffix', prefix.length, suffix.length);
