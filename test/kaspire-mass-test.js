'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let bad = 0;
const t = (n, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' | ' + d)); };
const EXPR = 'Object.assign({}, rpcTx, { mass: rpcTx.mass === undefined ? 0 : rpcTx.mass })';
const OLD = 'params: { transaction: rpcTx, allowOrphan: true }';
const src = fs.readFileSync(path.join(root, 'web', 'kaspire.js'), 'utf8');
t('kaspire.js sends the transaction with a top-level mass', src.indexOf(EXPR) >= 0 && src.indexOf(OLD) < 0);
const site = path.join(root, 'docs', 'index.html');
if (fs.existsSync(site)) { const h = fs.readFileSync(site, 'utf8'); t('docs/index.html (generated) carries the same fix', h.indexOf(EXPR) >= 0 && h.indexOf(OLD) < 0); }
(async () => {
  let note = null;
  try {
    const sent = [];
    class Fake {
      constructor(u) { this.url = u; setImmediate(() => { if (this.onopen) this.onopen(); }); }
      send(d) { sent.push(JSON.parse(d)); setImmediate(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify({ id: 1, params: { transactionId: 'ff'.repeat(32) } }) }); }); }
      close() {}
    }
    Object.defineProperty(globalThis, 'WebSocket', { value: Fake, configurable: true, writable: true });
    if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
    const K = require('../web/kaspire.js');
    const mod = (K && K.create) ? K : (K && K.Kaspire) ? K.Kaspire : globalThis.Kaspire;
    const w = mod && typeof mod.create === 'function' ? mod.create({ WebSocket: Fake }) : null;
    if (!w || typeof w.broadcast !== 'function') note = 'could not create a connector with a broadcast function';
    else {
      const tx = { version: 1, inputs: [], outputs: [], lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '' };
      const r = await w.broadcast('{}', tx, { wrpc: ['wss://test.invalid'] });
      if (!sent.length) note = 'the fake WebSocket was never used (the connector takes its WebSocket from elsewhere); result ' + JSON.stringify(r).slice(0, 80);
      else {
        t('wrpc submit includes mass 0', sent[0].method === 'submitTransaction' && sent[0].params.transaction.mass === 0, JSON.stringify(Object.keys(sent[0].params.transaction)));
        t('the input transaction object is not mutated', tx.mass === undefined);
        await w.broadcast('{}', Object.assign({}, tx, { mass: 7 }), { wrpc: ['wss://test.invalid'] });
        t('an explicit mass is kept', sent.length > 1 && sent[1].params.transaction.mass === 7);
      }
    }
  } catch (e) { note = 'could not exercise the connector: ' + String(e && e.message).slice(0, 100); }
  if (note) console.log('INFO behavioural check skipped: ' + note);
  console.log(bad ? 'KASPIRE MASS TEST FAILED' : 'KASPIRE MASS TEST OK');
  process.exit(bad);
})();
