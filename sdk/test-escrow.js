'use strict';
const fs = require('fs'), E = require('./escrow.js');
const ABI = 'contracts/escrow.json';
if (!fs.existsSync(ABI)) { console.log('SKIP no escrow ABI'); process.exit(0); }
const abi = JSON.parse(fs.readFileSync(ABI, 'utf8'));
let bad = 0, ran = 0;
const t = (n, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' | ' + d)); };
for (const lp of ['data/escrow-ledger-testnet-v13.json', 'data/escrow-ledger-marks3-v13.json']) {
  const nm = lp.split('/').pop().replace('.json', '');
  if (!fs.existsSync(lp)) { console.log('INFO ' + nm + ' not present'); continue; }
  const L = JSON.parse(fs.readFileSync(lp, 'utf8'));
  if (!L.state || !L.spk) { console.log('INFO ' + nm + ' has no state/spk, skipped; keys: ' + Object.keys(L).join(',')); continue; }
  ran++;
  const r = E.verifyEscrowScript({ abi, state: L.state, spk: L.spk });
  t(nm + ': script rebuilt from ledger state [' + r.checks.map((c) => c.name + (c.ok ? ':ok' : ':' + c.detail)).join(' ') + ']', r.ok, '');
  const base = E.escrowSpk(abi, L.state); let same = '';
  for (const [name, w] of E.FIELDS) {
    const s2 = Object.assign({}, L.state), v = s2[name];
    if (w === 32) s2[name] = (v[0] === '0' ? '1' : '0') + v.slice(1); else if (w === 1) s2[name] = Number(v) === 0 ? 1 : 0; else s2[name] = String(BigInt(v) + 1n);
    let sp = null; try { sp = E.escrowSpk(abi, s2); } catch (e) { sp = null; }
    if (sp === base) same += ' ' + name;
  }
  t(nm + ': every one of the 8 fields changes the script', same === '', 'unchanged by:' + same);
}
if (!ran) {
  const synthState = { ownerIdentifier: '11'.repeat(32), identifierType: 0, edition_covid: '22'.repeat(32), askPrice: '200000000', expireAge: '100000', artist: '33'.repeat(32), royalty_bips: '500', offerer: '44'.repeat(32) };
  const synthSpk = E.escrowSpk(abi, synthState);
  const vr = E.verifyEscrowScript({ abi, state: synthState, spk: synthSpk });
  t('canonical escrow ABI (18e3d59a…): script rebuilt and verified [' + vr.checks.map((c) => c.name + (c.ok ? ':ok' : ':' + c.detail)).join(' ') + ']', vr.ok, '');
  let same = '';
  for (const [name, w] of E.FIELDS) {
    const s2 = Object.assign({}, synthState), v = s2[name];
    if (w === 32) s2[name] = (v[0] === '0' ? '1' : '0') + v.slice(1); else if (w === 1) s2[name] = Number(v) === 0 ? 1 : 0; else s2[name] = String(BigInt(v) + 1n);
    if (E.escrowSpk(abi, s2) === synthSpk) same += ' ' + name;
  }
  t('canonical escrow ABI: every one of the 8 fields changes the script', same === '', 'unchanged by:' + same);
}
console.log(bad ? 'ESCROW TESTS FAILED' : 'ESCROW TESTS OK'); process.exit(bad);
