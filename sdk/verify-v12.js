'use strict';
// Read-only, no key. v12-style ledger (no lineage/sales). Usage: PC_NET=mainnet node sdk/verify-v12.js [ledger.json]
const fs = require('fs');
const N = require('../network.js'), CH = require('../web/reliks-chain.js'), sdk = require('./read.js');
if (/test/i.test(String(N.label))) { console.log('FAIL network is ' + N.label + '; need PC_NET=mainnet'); process.exit(2); }
CH.init(require('../reliks-templates.js')());
const L = JSON.parse(fs.readFileSync(process.argv[2] || 'data/factory-ledger-mainnet.json', 'utf8')), S = L.series;
const want = String(S.program_hash).toLowerCase();
let bad = 0;
const say = (ok, m) => { if (ok === false) bad = 1; console.log((ok === true ? 'PASS ' : ok === false ? 'FAIL ' : 'INFO ') + m); };
function scan(bc) {
  for (let i = 0; i < bc.length; i++) {
    const op = bc[i]; let n, s;
    if (op >= 1 && op <= 75) { n = op; s = i + 1; }
    else if (op === 0x4c && i + 1 < bc.length) { n = bc[i + 1]; s = i + 2; }
    else if (op === 0x4d && i + 2 < bc.length) { n = bc.readUInt16LE(i + 1); s = i + 3; }
    else continue;
    if (n > 100 && s + n <= bc.length) { const b = new Uint8Array(bc.subarray(s, s + n)); if (sdk.programHash(b) === want) return b; }
  }
  return null;
}
let found = null;
for (const f of fs.readdirSync('data').filter((n) => /^factory-abi-.*\.json$/.test(n))) {
  try { const abi = JSON.parse(fs.readFileSync('data/' + f, 'utf8')); const c = abi.contracts[Object.keys(abi.contracts)[0]]; const b = scan(Buffer.from(c.compiled.bytecode)); if (b) { found = { f, n: b.length, magic: Buffer.from(b.subarray(0, 4)).toString('hex') }; break; } } catch (e) { /* skip */ }
}
say(!!found, found ? 'engine found in data/' + found.f + ' (' + found.n + ' B, first 4 bytes ' + found.magic + (found.magic === '52564d01' ? ' = RVM magic, VM bytecode' : ' = NOT the RVM magic (52564d01), so not VM bytecode') + '), blake2b == program_hash ' + want.slice(0, 16) : 'no data/factory-abi-*.json has a push hashing to ' + want.slice(0, 16));
say(null, 'engine_lang ' + S.engine_lang + ' | program_hash ' + want.slice(0, 8) + (/^(792fed9b|cf1f1e60)/.test(want) ? ' (= a Reliks-VM program hash)' : ' (not a known Reliks-VM program hash)'));
L.editions.forEach((e, i) => { const r = sdk.verifyEditionScript({ chain: CH, series: S, covId: L.C, edition: e }); say(r.ok, 'edition ' + i + ' script rebuilt from v12 template [' + r.checks.map((c) => c.name + (c.ok ? ':ok' : ':' + c.detail)).join(' ') + ']'); });
(async () => {
  const io = CH.makeIO({ rest: N.rest, kascov: N.kascov });
  const age = await sdk.kascovTipAgeSec(N.kascov);
  say(null, N.label + ' | kascov staleness (tip age + sync lag): ' + (age === undefined ? 'unknown' : age + ' s'));
  for (const [i, e] of L.editions.entries()) {
    const r = await sdk.verifyEditionOnChain({ chain: CH, io, series: S, covId: L.C, edition: e, tipAgeSec: age });
    say(r.status === 'confirmed' ? true : null, 'edition ' + i + ' on chain: ' + r.status + (r.observed ? ' (index showed: ' + r.observed + ')' : ''));
  }
  process.exit(bad);
})();
