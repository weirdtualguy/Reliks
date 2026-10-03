'use strict';
const plan = require('./plan.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeLookup(node, rpcTx) {
  try { const s = await node.lookup(rpcTx); return s === 'mined' || s === 'mempool' || s === 'absent' ? s : 'unknown'; }
  catch (e) { return 'unknown'; }
}

// node: { submit(rpcTx) -> {txId} | throws, lookup(rpcTx) -> 'mined'|'mempool'|'absent'|'unknown' }
// lookup may return 'absent' only with positive evidence (not in any queried mempool AND inputs still unspent).
// rpcTx is never modified; every retry sends the identical object. Ledger writes belong on result.mined === true only.
async function submitSafe({ node, rpcTx, currentFee, maxAttempts = 3, backoffMs = 2000, sleep = wait }) {
  if (!node || typeof node.submit !== 'function' || typeof node.lookup !== 'function') throw new Error('node needs submit(rpcTx) and lookup(rpcTx)');
  const log = [];
  const done = (o, attempts) => Object.assign({ attempts, log }, o);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res, err = null;
    try { res = await node.submit(rpcTx); } catch (e) { err = String(e && e.message || e); }
    if (!err && res && res.txId) { log.push({ attempt, submitted: res.txId }); return done({ ok: true, state: 'submitted', txId: res.txId, mined: false }, attempt); }
    const unclear = !err;
    if (unclear) err = 'submit returned no txId';
    const cls = unclear ? 'unclear' : plan.classifyRejection(err);
    log.push({ attempt, class: cls, msg: err.slice(0, 160) });
    if (cls === 'fee') {
      const req = plan.parseRequiredFee(err);
      const next = req !== null ? req + req / 10n + 1n : (currentFee != null ? BigInt(currentFee) * 2n : null);
      return done({ ok: false, state: 'needs_rebuild', nextFee: next }, attempt);
    }
    if (cls === 'fatal') return done({ ok: false, state: 'rejected', error: err }, attempt);
    const lk = await safeLookup(node, rpcTx);
    log.push({ attempt, lookup: lk });
    if (lk === 'mined') return done({ ok: true, state: 'landed', mined: true }, attempt);
    if (lk === 'mempool') return done({ ok: true, state: cls === 'duplicate' ? 'already_known' : 'landed', mined: false }, attempt);
    if (cls === 'stale' && lk === 'absent') return done({ ok: false, state: 'stale', error: err }, attempt);
    if (cls !== 'transient' || lk !== 'absent') return done({ ok: false, state: 'ambiguous', error: err }, attempt);
    if (attempt < maxAttempts) await sleep(backoffMs * attempt);
  }
  return done({ ok: false, state: 'exhausted' }, maxAttempts);
}
module.exports = { submitSafe };
