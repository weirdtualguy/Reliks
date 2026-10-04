'use strict';
// Read-only, no key. Rebuilds each recorded mint with planMint and compares with the chain (kascov).
// Usage: PC_NET=testnet node sdk/replay-mint.js <ledger.json> <factory-abi.json> [<edition-abi.json>]
const fs = require('fs');
const N = require('../network.js'), CH = require('../web/reliks-chain.js'), T = require('./templates.js'), plan = require('./plan.js');
const [lp, fa, ea] = process.argv.slice(2);
if (!lp || !fa) { console.log('usage: node sdk/replay-mint.js <ledger.json> <factory-abi.json> [<edition-abi.json>]'); process.exit(2); }
CH.init(T.templatesFor({ factoryAbi: fa, editionAbi: ea || 'data/edition-abi-v13.json' }));
const L = JSON.parse(fs.readFileSync(lp, 'utf8')), S = L.series, nm = lp.split('/').pop().replace('.json', '');
const bare = (s) => CH.stripVersion(String(s || '')).toLowerCase();
const get = async (id) => { const r = await fetch(N.kascov + '/c/' + id + '.json'); if (!r.ok) throw new Error('kascov ' + r.status); return r.json(); };
(async () => {
  const lane = await get(L.C), lu = (op) => (lane.utxos || []).find((u) => u.outpoint === op);
  let ok = 0, bad = 0;
  for (let k = 0; k < L.editions.length; k++) {
    const e = L.editions[k], res = [], add = (n, p, d) => res.push([n, !!p, d || '']);
    try {
      const prevTx = k === 0 ? L.genesisTxId : L.editions[k - 1].mintTxId, pu = lu(prevTx + ':0'), nu = lu(e.mintTxId + ':0');
      add('kascov lists the previous and next lane outputs', pu && nu, !pu ? 'previous ' + prevTx.slice(0, 10) : !nu ? 'next ' + e.mintTxId.slice(0, 10) : '');
      const ed = await get(e.cov), eus = (ed.utxos || []).slice().sort((a, b) => Number(a.created_daa) - Number(b.created_daa)), first = eus[0];
      add('kascov lists the edition outputs', !!first);
      const buyer = first && first.revealed_hex ? CH.decodeEditionState(first.revealed_hex).ownerIdentifier : e.owner;
      const st = { program_hash: S.program_hash, artist: S.artist, price: BigInt(S.price), royalty_bips: BigInt(S.royalty_bips), mints_left: BigInt(S.mints_left) - BigInt(k), engine_lang: BigInt(S.engine_lang), render_hash: S.render_hash };
      const laneSpk = CH.p2shSpk(CH.factoryRedeem(st));
      if (pu && nu && first) {
        add('previous lane script == factory template + derived state', bare(pu.script_hex) === laneSpk);
        const pl = plan.planMint({ hrp: N.hrp, lane: { state: st, spk: laneSpk, outpoint: { txId: prevTx, index: 0 }, value: BigInt(pu.value), covenantId: L.C, daa: 0n }, funding: { txId: 'ab'.repeat(32), index: 1, amount: 100000000000n, daa: 5 }, buyer: { pubkey: buyer, address: CH.p2pkAddress(N.hrp, buyer) } });
        add('planMint invariants hold', pl.ok, pl.checks.filter((c) => !c.ok).map((c) => c.name).join(','));
        add('next lane script == chain', pl.draft.outputs[0].spk === bare(nu.script_hex));
        add('edition script at mint time == chain', pl.draft.outputs[1].spk === bare(first.script_hex));
        add('serial == ledger', String(pl.summary.serial) === String(e.serial));
      }
    } catch (x) { add('replay ran', false, String(x && x.message || x).slice(0, 100)); }
    const good = res.every((r) => r[1]);
    good ? ok++ : bad++;
    console.log((good ? 'PASS ' : 'FAIL ') + nm + ' edition ' + k + (good ? '' : ' | ' + res.filter((r) => !r[1]).map((r) => r[0] + (r[2] ? ' (' + r[2] + ')' : '')).join('; ')));
  }
  console.log('replay ' + nm + ': ' + ok + ' of ' + (ok + bad) + ' mints rebuilt identically to the chain');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
