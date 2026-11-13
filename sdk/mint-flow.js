'use strict';
// Orchestrates one mint on an existing lane: plan -> (sign) -> (send) -> confirm -> ledger. All I/O is injected, so the safety rules are tested without a network or a key.
// Modes: dry (plan only; the key is never requested), sign (sign and verify, send nothing), send (needs the planned serial typed back).
const fs = require('fs');
const plan = require('./plan.js'), sign = require('./sign.js');
const { prepare } = require('./submit-node.js'), { submitSafe } = require('./submit.js'), { confirmMined } = require('./flow.js');
const CARRIER = 100000000n, FEE_BUFFER = 10000000n, DEFAULT_MAX_FEE = 50000000n;
const out = (status, extra) => Object.assign({ ok: status === 'dry_run' || status === 'signed_not_sent' || status === 'minted', status }, extra || {});
const msg = (e) => String(e && e.message || e).slice(0, 160);

async function runMint(d) {
  if (!d || !d.chain || !d.node || !d.wallet) throw new Error('chain, node and wallet required');
  const mode = d.mode;
  if (mode !== 'dry' && mode !== 'sign' && mode !== 'send') throw new Error('mode must be dry, sign or send');
  if (mode === 'send' && !d.ledger) throw new Error('send mode needs a ledger');
  const lane = d.lane;
  if (!lane || !lane.ok) return out('lane_' + ((lane && lane.status) || 'unavailable'), { checks: lane && lane.checks });
  if (lane.soldOut) return out('sold_out');
  const price = BigInt(lane.state.price), need = price + CARRIER + FEE_BUFFER;
  const funding = await d.pickFunding(need);
  if (!funding) return out('no_funding', { need });
  const mkPlan = (fee) => plan.planMint({ hrp: d.hrp, lane: { state: lane.state, spk: lane.spk, outpoint: lane.outpoint, value: lane.value, covenantId: lane.covenantId, daa: 0n }, funding, buyer: d.wallet, fee });
  let pl;
  try { pl = mkPlan(undefined); } catch (e) { return out('plan_error', { error: msg(e) }); }
  if (!pl.ok) return out('plan_failed', { failed: pl.checks.filter((c) => !c.ok).map((c) => c.name) });
  const problem = d.ledger ? await d.ledger.preflight(lane) : null;
  if (mode === 'dry') return out('dry_run', { plan: pl, funding, ledgerWarning: problem });
  if (problem) return out('ledger_out_of_sync', { error: problem });
  const serial = String(pl.summary.serial);
  if (mode === 'send' && String(d.confirmSerial) !== serial) return out('serial_not_confirmed', { serial, plan: pl, funding });
  const prep = (p) => {
    let key; try { key = d.getKey(); } catch (e) { return { error: 'no_key', message: msg(e) }; }
    let signed; try { signed = sign.signWallet(d.chain, p.draft, key); } catch (e) { return { error: 'key_mismatch', message: msg(e) }; }
    const chk = plan.checkSigned(p.draft, signed);
    if (!chk.ok) return { error: 'signed_check_failed', message: chk.error };
    const pp = prepare(chk.rpcTx);
    if (!pp.ok) return { error: 'prepare_failed', message: pp.problems.join(', ') };
    return { rpcTx: chk.rpcTx, bytes: pp.bytes };
  };
  let cur = pl, s = prep(cur);
  if (s.error) return out(s.error, { message: s.message });
  if (mode === 'sign') return out('signed_not_sent', { plan: cur, funding, bytes: s.bytes });
  const maxTries = d.maxFeeTries || 3, maxFee = d.maxFee == null ? DEFAULT_MAX_FEE : BigInt(d.maxFee);
  let r;
  for (let t = 1; t <= maxTries; t++) {
    r = await submitSafe({ node: d.node, rpcTx: s.rpcTx, currentFee: cur.fee, sleep: d.sleep });
    if (r.state !== 'needs_rebuild') break;
    const next = r.nextFee;
    if (next === null || next === undefined || BigInt(next) > maxFee) return out('fee_too_high', { nextFee: next });
    if (t === maxTries) return out('fee_loop_exhausted', { nextFee: next });
    try { cur = mkPlan(BigInt(next)); } catch (e) { return out('plan_error', { error: msg(e) }); }
    if (!cur.ok) return out('plan_failed', { failed: cur.checks.filter((c) => !c.ok).map((c) => c.name) });
    s = prep(cur);
    if (s.error) return out(s.error, { message: s.message });
  }
  if (r.state !== 'submitted') return out('send_' + r.state, { error: r.error, log: r.log });
  const txId = r.txId;
  let cm;
  try { cm = await confirmMined({ lookup: d.node.lookup, rpcTx: s.rpcTx, txId, tries: d.confirmTries || 60, intervalMs: d.intervalMs == null ? 10000 : d.intervalMs, sleep: d.sleep }); }
  catch (e) { return out('submitted_not_confirmed', { txId, error: msg(e) }); }
  if (!cm.mined) return out('submitted_not_confirmed', { txId, polls: cm.polls, last: cm.last });
  const edOut = cur.draft.outputs.find((o) => o.role === 'edition');
  const entry = { txId, index: 1, mintTxId: txId, mintIndex: 1, cov: cur.summary.editionCovenantId, serial, lineage: d.chain.genesisLineage(lane.outpoint.txId, lane.outpoint.index), sales: 0, owner: d.wallet.pubkey, price: 0, amount: Number(CARRIER), spk: Buffer.from(edOut.spk).toString('hex') };
  let wrote = false;
  try { if (!(await d.ledger.hasTx(txId))) wrote = await d.ledger.append(entry); }
  catch (e) { return out('minted_ledger_write_failed', { txId, entry, error: msg(e) }); }
  return out('minted', { txId, entry, wrote, plan: cur });
}

const KEYS = ['txId', 'index', 'mintTxId', 'mintIndex', 'cov', 'serial', 'lineage', 'sales', 'owner', 'price', 'amount', 'spk'].sort();
function ledgerStore(file) {
  const load = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    async preflight(lane) {
      let doc; try { doc = load(); } catch (e) { return 'cannot read the ledger: ' + msg(e).slice(0, 60); }
      if (!doc || !doc.series || !Array.isArray(doc.editions)) return 'the ledger has no series or editions';
      if (doc.C !== lane.covenantId) return 'the ledger lane covenant differs from the lane being minted';
      let left; try { left = BigInt(doc.series.mints_left) - BigInt(doc.editions.length); } catch (e) { return 'the ledger mints_left is unreadable'; }
      if (left !== BigInt(lane.state.mints_left)) return 'the ledger says ' + left + ' mints left, the chain says ' + lane.state.mints_left;
      const last = doc.editions[doc.editions.length - 1];
      if (last && JSON.stringify(Object.keys(last).sort()) !== JSON.stringify(KEYS)) return 'the ledger edition entries have different fields than this tool writes';
      try { fs.accessSync(file, fs.constants.W_OK); } catch (e) { return 'the ledger file is not writable'; }
      return null;
    },
    async hasTx(txId) { return load().editions.some((e) => e.txId === txId || e.mintTxId === txId); },
    async append(entry) {
      const doc = load();
      if (doc.editions.some((e) => e.txId === entry.txId)) return false;
      fs.writeFileSync(file + '.bak-premint', fs.readFileSync(file));
      doc.editions.push(entry);
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(doc, null, 2)); fs.renameSync(tmp, file);
      return true;
    },
  };
}
module.exports = { runMint, ledgerStore, CARRIER, KEYS };
