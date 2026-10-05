'use strict';
// wRPC submitTransaction adapter for submitSafe. Dry run unless send === true. Node only (ws + Origin header).
const DEFAULT_HEADERS = { 'User-Agent': 'Mozilla/5.0', Origin: 'https://wallet.kaspanet.io' };
const HEX64 = /^[0-9a-f]{64}$/i, HEXE = /^([0-9a-f]{2})+$/i, SIG = /^41[0-9a-f]{128}01$/i;

function defaultCall(url, method, params, headers) {
  return new Promise((resolve) => {
    let w; const WS = require('ws');
    try { w = new WS(url, { headers }); } catch (e) { return resolve('ERR ' + e.message); }
    const t = setTimeout(() => { try { w.terminate(); } catch (e) {} resolve('TIMEOUT'); }, 15000);
    w.on('open', () => w.send(JSON.stringify({ id: 1, method, params })));
    w.on('message', (d) => { clearTimeout(t); try { w.close(); } catch (e) {} resolve(d.toString()); });
    w.on('error', (e) => { clearTimeout(t); resolve('ERR ' + e.message); });
  });
}

function prepare(rpcTx, opts) {
  const allowOrphan = !!(opts && opts.allowOrphan), tx = rpcTx || {}, bad = [];
  if (!Number.isInteger(tx.version)) bad.push('version');
  const ins = Array.isArray(tx.inputs) ? tx.inputs : [], outs = Array.isArray(tx.outputs) ? tx.outputs : [];
  if (!ins.length) bad.push('no inputs');
  if (!outs.length) bad.push('no outputs');
  ins.forEach((i, k) => {
    const op = (i && i.previousOutpoint) || {};
    if (!HEX64.test(String(op.transactionId || '')) || !Number.isInteger(op.index) || op.index < 0) bad.push('input ' + k + ' outpoint');
    if (!HEXE.test(String((i && i.signatureScript) || ''))) bad.push('input ' + k + ' unsigned');
  });
  if (ins.length && !ins.some((i) => SIG.test(String((i && i.signatureScript) || '')))) bad.push('no standard signature on any input');
  outs.forEach((o, k) => {
    if (!Number.isSafeInteger(o && o.value) || o.value <= 0) bad.push('output ' + k + ' value');
    if (!/^0000[0-9a-f]+$/i.test(String((o && o.scriptPublicKey) || ''))) bad.push('output ' + k + ' script');
    if (o && o.covenant && (!HEX64.test(String(o.covenant.covenantId || '')) || !Number.isInteger(o.covenant.authorizingInput) || o.covenant.authorizingInput < 0 || o.covenant.authorizingInput >= ins.length)) bad.push('output ' + k + ' covenant');
  });
  // The nodes reject a transaction without the top-level mass field (observed 2026-10-03: 'request deserialization error'); every tool that has submitted successfully sets mass: 0.
  const params = { transaction: Object.assign({}, tx, { mass: tx.mass === undefined ? 0 : tx.mass }), allowOrphan };
  return { ok: bad.length === 0, problems: bad, request: { method: 'submitTransaction', params }, bytes: JSON.stringify(params).length };
}

function createNodeSubmit({ urls, send = false, allowOrphan = false, headers = DEFAULT_HEADERS, call }) {
  if (!Array.isArray(urls) || !urls.length) throw new Error('urls[] required');
  const rpc = call || defaultCall;
  return {
    prepare: (tx) => prepare(tx, { allowOrphan }),
    async submit(rpcTx) {
      const p = prepare(rpcTx, { allowOrphan });
      if (!p.ok) throw new Error('refusing to submit: ' + p.problems.join(', '));
      if (!send) throw new Error('dry run: send is not enabled');
      const msgs = [];
      for (const u of urls) {
        let s; try { s = await rpc(u, 'submitTransaction', p.request.params, headers); } catch (e) { s = 'ERR ' + (e && e.message || e); }
        s = String(s);
        let j = null; try { j = JSON.parse(s); } catch (e) {}
        const r = j && (j.params || j.result);
        if (r && HEX64.test(String(r.transactionId || ''))) return { txId: r.transactionId, url: u };
        msgs.push((j && j.error && j.error.message) || s.slice(0, 240));
      }
      throw new Error(msgs.join(' | ') || 'no endpoints');
    },
  };
}
module.exports = { createNodeSubmit, prepare, defaultCall, DEFAULT_HEADERS };
