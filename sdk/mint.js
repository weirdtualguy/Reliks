'use strict';
// Mints one edition on an existing TESTNET lane.
//   PC_NET=testnet PC_WALLET=<address> node sdk/mint.js <ledger.json> <factory-abi.json> [<edition-abi.json>]                  dry run: plan only, no key
//   ... --sign                                                                                                              also signs and verifies; sends nothing
//   ... --send --confirm-serial <serial>                                                                                    broadcasts (PC_PRIV must be exported); add --allow-orphan only if a node asks for it
const fs = require('fs');
const { schnorr } = require('@noble/curves/secp256k1');
const N = require('../network.js'), CH = require('../web/reliks-chain.js'), R = require('./read.js'), T = require('./templates.js'), LN = require('./lane.js');
const { createNodeSubmit } = require('./submit-node.js'), { createNodeLookup } = require('./node-lookup.js'), { runMint, ledgerStore } = require('./mint-flow.js');
const argv = process.argv.slice(2), pos = [], flags = {};
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--confirm-serial') flags.serial = argv[++i]; else if (a.indexOf('--') === 0) flags[a.slice(2)] = true; else pos.push(a); }
const mode = flags.send ? 'send' : flags.sign ? 'sign' : 'dry';
const fail = (m) => { console.log(m); process.exit(2); };
const KAS = (v) => (Number(v) / 1e8).toFixed(4) + ' KAS', CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function pubkeyOf(a) {
  const p = String(a).split(':');
  if (p.length !== 2 || p[0] !== N.hrp) throw new Error('PC_WALLET is not a ' + N.hrp + ' address');
  const v = Array.from(p[1]).map((c) => CS.indexOf(c));
  if (v.some((x) => x < 0) || v.length < 9) throw new Error('bad address characters');
  let acc = 0, bits = 0; const o = [];
  for (const x of v.slice(0, -8)) { acc = (acc << 5) | x; bits += 5; while (bits >= 8) { bits -= 8; o.push((acc >> bits) & 255); } acc &= (1 << bits) - 1; }
  if (o.length !== 33 || o[0] !== 0 || acc !== 0) throw new Error('not a version-0 P2PK address');
  const pub = Buffer.from(o.slice(1)).toString('hex');
  if (CH.p2pkAddress(N.hrp, pub) !== a) throw new Error('address checksum or encoding mismatch');
  return pub;
}
(async () => {
  const [lp, fa, ea] = pos;
  if (!lp || !fa) fail('usage: PC_NET=testnet PC_WALLET=<address> node sdk/mint.js <ledger.json> <factory-abi.json> [<edition-abi.json>] [--sign | --send --confirm-serial <serial>]');
  if (flags.send && flags.sign) fail('use --sign or --send, not both');
  if (flags.serial && !flags.send) fail('--confirm-serial only goes with --send');
  if (!/testnet/i.test(String(N.label))) fail('this tool mints on testnet only for now (network: ' + N.label + ')');
  const addr = process.env.PC_WALLET;
  if (!addr) fail('set PC_WALLET to your testnet address');
  const pub = pubkeyOf(addr);
  if (mode !== 'dry') {
    const k = process.env.PC_PRIV;
    if (!k || !/^[0-9a-fA-F]{64}$/.test(k)) fail('PC_PRIV is not set to 64 hex characters');
    const kp = Buffer.from(schnorr.getPublicKey(Uint8Array.from(Buffer.from(k, 'hex')))).toString('hex');
    if (kp !== pub) fail('PC_PRIV does not belong to PC_WALLET');
  }
  CH.init(T.templatesFor({ factoryAbi: fa, editionAbi: ea || 'data/edition-abi-v13.json' }));
  const led = JSON.parse(fs.readFileSync(lp, 'utf8')), io = CH.makeIO({ rest: N.rest, kascov: N.kascov }), age = await R.kascovTipAgeSec(N.kascov);
  const lane = await LN.resolveLaneKascov({ chain: CH, io, laneCovenantId: led.C, series: led.series, tipAgeSec: age });
  console.log(N.label + ' | mode ' + mode + ' | staleness ' + (age === undefined ? 'unknown' : age + ' s') + ' | lane ' + led.C.slice(0, 8) + ' ' + lane.status + (lane.ok ? ' | mints left ' + lane.state.mints_left + ' | price ' + KAS(lane.state.price) : ''));
  const pickFunding = async (need) => {
    const us = await (await fetch(N.rest + '/addresses/' + addr + '/utxos')).json();
    const c = (Array.isArray(us) ? us : []).filter((u) => u.utxoEntry && u.utxoEntry.blockDaaScore && !u.utxoEntry.isCoinbase && BigInt(u.utxoEntry.amount) >= need).sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
    return c.length ? { txId: c[0].outpoint.transactionId, index: c[0].outpoint.index, amount: BigInt(c[0].utxoEntry.amount), daa: Number(c[0].utxoEntry.blockDaaScore) } : null;
  };
  const ns = createNodeSubmit({ urls: N.wrpc, send: mode === 'send', allowOrphan: !!flags['allow-orphan'] });
  const r = await runMint({ chain: CH, hrp: N.hrp, mode, confirmSerial: flags.serial, lane, wallet: { pubkey: pub, address: addr }, pickFunding, getKey: () => process.env.PC_PRIV, node: { submit: ns.submit, lookup: createNodeLookup({ urls: N.wrpc, address: addr }) }, ledger: ledgerStore(lp) });
  const show = (pl, f) => {
    if (f) console.log('funding ' + f.txId.slice(0, 12) + ':' + f.index + ' ' + KAS(f.amount));
    console.log('fee ' + KAS(pl.fee) + ' | size estimate ' + pl.size + ' B (network mass NOT measured)');
    pl.draft.outputs.forEach((o, i) => console.log('  out ' + i + ' ' + o.role.padEnd(8) + KAS(o.value) + (o.covenant ? ' | covenant ' + o.covenant.covenantId.slice(0, 10) : '')));
    console.log('serial ' + pl.summary.serial + ' | edition covenant ' + pl.summary.editionCovenantId.slice(0, 16) + ' | mints left after ' + pl.summary.mintsLeftAfter);
  };
  const base = 'PC_NET=testnet PC_WALLET=' + addr.slice(0, 16) + '... node sdk/mint.js ' + lp + ' ' + fa;
  console.log('result: ' + r.status);
  if (r.plan) show(r.plan, r.funding);
  if (r.status === 'dry_run') { if (r.ledgerWarning) console.log('ledger warning: ' + r.ledgerWarning); console.log('dry run: no key read, nothing signed or sent. Next: add --sign (needs PC_PRIV exported).'); }
  else if (r.status === 'signed_not_sent') console.log('signed and verified against the plan (' + r.bytes + ' B of JSON); nothing was sent. To send: add --send --confirm-serial ' + r.plan.summary.serial);
  else if (r.status === 'serial_not_confirmed') console.log('to send, repeat the command with: --send --confirm-serial ' + r.serial);
  else if (r.status === 'minted') console.log('minted: ' + r.txId + (r.wrote ? ' | ledger updated (backup: ' + lp + '.bak-premint)' : ' | ledger already had it') + '\nnext: node sdk/claim-live.js --ledger ' + lp + '   (once kascov has caught up)');
  else if (r.status === 'minted_ledger_write_failed') console.log('mined: ' + r.txId + ' but the ledger write failed (' + r.error + '). Add this entry to the ledger editions by hand:\n' + JSON.stringify(r.entry));
  else if (r.status === 'submitted_not_confirmed') console.log('accepted by a node as ' + r.txId + ' but not seen mined in time. Do NOT resubmit. Check: PC_NET=testnet node tools/tx-status.js ' + r.txId + '   The ledger was NOT updated.');
  else if (r.status.indexOf('send_') === 0) console.log('the send did not complete (' + r.status + '). Do NOT resubmit blindly. Check whether the lane advanced: PC_NET=testnet node sdk/lane-live.js ' + lp + ' ' + fa + ' (after the index catches up), and the wallet UTXOs. ' + (r.error ? 'detail: ' + r.error : ''));
  else { if (r.message) console.log('detail: ' + r.message); if (r.error) console.log('detail: ' + r.error); if (r.failed) console.log('failed checks: ' + r.failed.join(', ')); if (r.nextFee !== undefined) console.log('node asked for a fee of about ' + KAS(r.nextFee)); }
  process.exit(r.ok ? 0 : 1);
})().catch((e) => { console.log('ERR', String(e && e.message || e).slice(0, 200)); process.exit(1); });
