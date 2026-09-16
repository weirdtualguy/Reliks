import * as fs from 'fs';
import WebSocket from 'ws';
const plan = JSON.parse(fs.readFileSync('plan.json', 'utf8'));
const spkFlat = (s: string) => '0000' + s;
(async () => {
  const body = { version: plan.transaction.version, lockTime: 0, subnetworkId: plan.transaction.subnetworkId, gas: 0, payload: '',
    inputs: plan.transaction.inputs.map((i: any, k: number) => ({ ...i, utxo: { amount: Number(plan.utxos[k].amount), scriptPublicKey: { version: 0, script: plan.utxos[k].spk }, ...(plan.utxos[k].covenantId ? { covenantId: plan.utxos[k].covenantId } : {}) } })),
    outputs: plan.transaction.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  console.log('preflight:', pf.verdict, JSON.stringify((pf.executed || []).map((e: any) => [e.input_index, e.pass, e.script_units_used, e.verdict])));
  if (pf.verdict !== 'ready') { console.log(JSON.stringify(pf.findings, null, 1)); process.exit(1); }
  const transaction = { ...plan.transaction, mass: pf.masses.storage,
    outputs: plan.transaction.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), gas: Number(plan.transaction.gas || 0) };
  for (const url of ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json']) {
    const ok = await new Promise<boolean>(res => {
      const ws = new WebSocket(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); res(false); }, 12000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); console.log('📥', s.substring(0, 300)); clearTimeout(t);
        if (s.includes('transactionId')) { const txid = JSON.parse(s).params.transactionId;
          const st = JSON.parse(fs.readFileSync('m2-state.json', 'utf8'));
          st.txid = txid; st.programHex = plan.next.programHex; st.spk = plan.next.spk; st.value = plan.next.value; st.price = plan.next.price;
          fs.writeFileSync('m2-state.json', JSON.stringify(st, null, 1)); console.log('🎉 accepted', txid, '— m2-state.json updated'); res(true); } else res(false); });
      ws.on('error', () => { clearTimeout(t); res(false); });
    });
    if (ok) process.exit(0);
  }
  process.exit(1);
})();
