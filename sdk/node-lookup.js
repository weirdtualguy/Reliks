'use strict';
// Read-only, no key. lookup(rpcTx, hint?) -> 'mined' | 'mempool' | 'absent' | 'unknown'. Never throws; any doubt is 'unknown'.
function defaultCall(u, method, params) {
  return new Promise((resolve) => {
    const WS = require('ws'); const w = new WS(u);
    const t = setTimeout(() => { try { w.terminate(); } catch (e) {} resolve('TIMEOUT'); }, 15000);
    w.on('open', () => w.send(JSON.stringify({ id: 1, method, params })));
    w.on('message', (d) => { clearTimeout(t); try { w.close(); } catch (e) {} resolve(d.toString()); });
    w.on('error', (e) => { clearTimeout(t); resolve('ERR ' + e.message); });
  });
}
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const entriesOf = (j) => { const p = j && (j.params || j.result); return p && Array.isArray(p.entries) ? p.entries : null; };
const IS_SIG = /^41[0-9a-f]{128}01$/i;

function createNodeLookup({ urls, address, call }) {
  if (!Array.isArray(urls) || !urls.length || !address) throw new Error('urls[] and address required');
  const rpc = call || defaultCall;
  return async function lookup(rpcTx, hint) {
    try {
      const txId = hint && hint.txId ? String(hint.txId).toLowerCase() : null;
      const walletIn = ((rpcTx && rpcTx.inputs) || []).filter((i) => IS_SIG.test(String(i.signatureScript || '')));
      const views = [];
      for (const u of urls) {
        const us = await rpc(u, 'getUtxosByAddresses', { addresses: [address] });
        const ms = await rpc(u, 'getMempoolEntriesByAddresses', { addresses: [address], includeOrphanPool: true, filterTransactionPool: false });
        const ue = entriesOf(parse(us)), me = entriesOf(parse(ms));
        if (!ue || !me) return 'unknown';
        views.push({
          unspent: new Set(ue.filter((e) => e.outpoint).map((e) => String(e.outpoint.transactionId).toLowerCase() + ':' + e.outpoint.index)),
          raw: String(ms).toLowerCase(),
          pending: me.reduce((n, e) => n + (e.sending || []).length + (e.receiving || []).length, 0),
        });
      }
      if (txId) {
        if (views.some((v) => Array.from(v.unspent).some((k) => k.indexOf(txId + ':') === 0))) return 'mined';
        if (views.some((v) => v.raw.indexOf(txId) >= 0)) return 'mempool';
      }
      if (!walletIn.length) return 'unknown';
      const keys = walletIn.map((i) => String(i.previousOutpoint.transactionId).toLowerCase() + ':' + i.previousOutpoint.index);
      return views.every((v) => v.pending === 0 && keys.every((k) => v.unspent.has(k))) ? 'absent' : 'unknown';
    } catch (e) { return 'unknown'; }
  };
}
module.exports = { createNodeLookup, defaultCall };
