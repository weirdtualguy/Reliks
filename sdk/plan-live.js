'use strict';
// Read-only, no key: plans the NEXT mint on a lane with the series' own templates and your wallet's real UTXO. Signs and sends nothing.
// Usage: PC_NET=testnet PC_WALLET=<address> node sdk/plan-live.js <ledger.json> <factory-abi.json> [<edition-abi.json>]
const fs = require('fs');
const N = require('../network.js'), CH = require('../web/reliks-chain.js'), R = require('./read.js'), T = require('./templates.js'), LN = require('./lane.js'), plan = require('./plan.js');
const [lp, fa, ea] = process.argv.slice(2), addr = process.env.PC_WALLET;
if (!lp || !fa || !addr) { console.log('usage: PC_WALLET=<address> node sdk/plan-live.js <ledger.json> <factory-abi.json> [<edition-abi.json>]'); process.exit(2); }
CH.init(T.templatesFor({ factoryAbi: fa, editionAbi: ea || 'data/edition-abi-v13.json' }));
const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', KAS = (v) => (Number(v) / 1e8).toFixed(4) + ' KAS';
function pubkeyOf(a) {
  const p = String(a).split(':');
  if (p.length !== 2 || p[0] !== N.hrp) throw new Error('address is not a ' + N.hrp + ' address');
  const v = Array.from(p[1]).map((c) => CS.indexOf(c));
  if (v.some((x) => x < 0) || v.length < 9) throw new Error('bad address characters');
  let acc = 0, bits = 0; const out = [];
  for (const x of v.slice(0, -8)) { acc = (acc << 5) | x; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } acc &= (1 << bits) - 1; }
  if (out.length !== 33 || out[0] !== 0 || acc !== 0) throw new Error('not a version-0 P2PK address');
  const pub = Buffer.from(out.slice(1)).toString('hex');
  if (CH.p2pkAddress(N.hrp, pub) !== a) throw new Error('address checksum or encoding mismatch');
  return pub;
}
(async () => {
  const led = JSON.parse(fs.readFileSync(lp, 'utf8')), io = CH.makeIO({ rest: N.rest, kascov: N.kascov }), age = await R.kascovTipAgeSec(N.kascov);
  const pub = pubkeyOf(addr);
  const lane = await LN.resolveLaneKascov({ chain: CH, io, laneCovenantId: led.C, series: led.series, tipAgeSec: age });
  console.log(N.label + ' | staleness ' + (age === undefined ? 'unknown' : age + ' s') + ' | lane ' + led.C.slice(0, 8) + ' ' + lane.status + (lane.ok ? ' | mints left ' + lane.state.mints_left + ' | price ' + KAS(lane.state.price) : ''));
  if (!lane.ok) process.exit(1);
  if (lane.soldOut) { console.log('the lane is sold out'); process.exit(1); }
  const need = BigInt(lane.state.price) + 100000000n + 10000000n;
  const us = await (await fetch(N.rest + '/addresses/' + addr + '/utxos')).json();
  const cand = (Array.isArray(us) ? us : []).filter((u) => u.utxoEntry && u.utxoEntry.blockDaaScore && !u.utxoEntry.isCoinbase && BigInt(u.utxoEntry.amount) >= need).sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  console.log('wallet utxos ' + (Array.isArray(us) ? us.length : '?') + ' | usable (confirmed, non-coinbase, >= ' + KAS(need) + '): ' + cand.length);
  if (!cand.length) process.exit(1);
  const f = cand[0], pl = plan.planMint({ hrp: N.hrp, lane: { state: lane.state, spk: lane.spk, outpoint: lane.outpoint, value: lane.value, covenantId: lane.covenantId, daa: 0n }, funding: { txId: f.outpoint.transactionId, index: f.outpoint.index, amount: BigInt(f.utxoEntry.amount), daa: Number(f.utxoEntry.blockDaaScore) }, buyer: { pubkey: pub, address: addr } });
  const failed = pl.checks.filter((c) => !c.ok);
  console.log('plan ok: ' + pl.ok + (failed.length ? ' | failed: ' + failed.map((c) => c.name + ' (' + c.detail + ')').join('; ') : ''));
  console.log('funding ' + f.outpoint.transactionId.slice(0, 12) + ':' + f.outpoint.index + ' ' + KAS(f.utxoEntry.amount) + ' | fee ' + KAS(pl.fee) + ' | size estimate ' + pl.size + ' B (network mass NOT measured)');
  pl.draft.outputs.forEach((o, i) => console.log('  out ' + i + ' ' + o.role.padEnd(8) + KAS(o.value) + (o.covenant ? ' | covenant ' + o.covenant.covenantId.slice(0, 10) + ' auth input ' + o.covenant.authorizingInput : '')));
  console.log('serial ' + pl.summary.serial + ' | edition covenant ' + pl.summary.editionCovenantId.slice(0, 16) + ' | mints left after ' + pl.summary.mintsLeftAfter + ' | nothing signed, nothing sent');
  process.exit(pl.ok ? 0 : 1);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
