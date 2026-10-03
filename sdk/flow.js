'use strict';
// Ledger writes belong after confirmMined(...).mined === true, never after a bare submit.
// "mined" = the adapter saw the tx's outputs in a node UTXO set. No confirmation depth.
async function confirmMined({ lookup, rpcTx, txId, tries = 30, intervalMs = 10000, sleep }) {
  if (typeof lookup !== 'function') throw new Error('lookup required');
  if (!/^[0-9a-f]{64}$/i.test(String(txId || ''))) throw new Error('txId required');
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = 'unknown';
  for (let i = 1; i <= tries; i++) {
    try { last = await lookup(rpcTx, { txId }); } catch (e) { last = 'unknown'; }
    if (last === 'mined') return { mined: true, polls: i, last };
    if (i < tries) await wait(intervalMs);
  }
  return { mined: false, polls: tries, last };
}
module.exports = { confirmMined };
