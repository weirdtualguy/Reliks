'use strict';
const CH = require('../web/reliks-chain.js');

// Observed in reliks-lib.js fee discovery: the node states the fee it requires.
function parseRequiredFee(msg) {
  const s = String(msg || '');
  const m = s.match(/required fee of (\d+)/i) || s.match(/under the required (\d+)/i) || s.match(/required amount of (\d+)/i) || s.match(/required fee[^\d]*(\d+)/i);
  return m ? BigInt(m[1]) : null;
}

// Node/indexer error text -> action. Only "already in the mempool" is an observed string; unknown text is fatal (never retried).
function classifyRejection(msg) {
  const m = String(msg || '').toLowerCase();
  if (/already in the mempool|already accepted|already exists/.test(m)) return 'duplicate';
  if (parseRequiredFee(m) !== null || /\bfee\b/.test(m)) return 'fee';
  if (/timeout|timed out|econn|enotfound|etimedout|socket hang|network|\b50[234]\b|unavailable|rate limit|\b429\b/.test(m)) return 'transient';
  if (/orphan|missing.*(outpoint|input|utxo)|not found|double.?spend|already spent/.test(m)) return 'stale';
  return 'fatal';
}

// p: { hrp, lane:{state,spk,outpoint,value,covenantId}, funding:{txId,index,amount,daa}, buyer:{pubkey,address}, fee? }
function planMint(p) {
  const st = p.lane.state;
  let fee = p.fee;
  if (fee === undefined || fee === null) fee = CH.estimateFee(CH.buildMint(Object.assign({}, p, { fee: 0n })));
  const draft = CH.buildMint(Object.assign({}, p, { fee: fee }));
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });
  const sum = (xs, f) => xs.reduce((a, x) => a + BigInt(f(x)), 0n);
  const inV = sum(draft.inputs, (i) => i.utxo.amount), outV = sum(draft.outputs, (o) => o.value);
  add('value_conserved', inV === outV + draft.fee, 'in ' + inV + ' out ' + outV + ' fee ' + draft.fee);
  const nextSt = Object.assign({}, st, { mints_left: BigInt(st.mints_left) - 1n });
  const lane = draft.outputs.find((o) => o.role === 'lane');
  add('lane_next_state', lane && lane.spk === CH.p2shSpk(CH.factoryRedeem(nextSt)));
  add('lane_covenant_kept', lane && lane.covenant && lane.covenant.authorizingInput === 0 && lane.covenant.covenantId === p.lane.covenantId);
  add('lane_value_kept', lane && BigInt(lane.value) === BigInt(p.lane.value));
  const op = p.lane.outpoint;
  const ed = draft.outputs.find((o) => o.role === 'edition');
  const edState = { ownerIdentifier: p.buyer.pubkey, identifierType: 0, price: 0, artist: st.artist, royalty_bips: st.royalty_bips, program_hash: st.program_hash, factory_covid: p.lane.covenantId, serial: draft.summary.serial };
  if (CH.editionHasLineage()) { edState.lineage = CH.genesisLineage(op.txId, op.index); edState.sales = 0; }
  add('edition_script', ed && ed.spk === CH.p2shSpk(CH.editionRedeem(edState)));
  add('edition_covenant', ed && ed.covenant && ed.covenant.authorizingInput === 1 && ed.covenant.covenantId === draft.summary.editionCovenantId);
  add('serial_from_lane_outpoint', String(draft.summary.serial) === String(CH.serialFromOutpoint(op.txId, op.index)));
  add('mints_left_after', BigInt(draft.summary.mintsLeftAfter) === BigInt(st.mints_left) - 1n);
  const price = BigInt(st.price), art = draft.outputs.find((o) => o.role === 'artist');
  add('artist_paid', price === 0n ? !art : (art && art.spk === CH.p2pkSpk(st.artist) && BigInt(art.value) === price));
  const roy = BigInt(st.royalty_bips);
  add('contract_royalty_range', roy >= 1n && roy <= 2000n, 'royalty_bips ' + roy + ' (factory requires 1..2000)');
  add('contract_price_floor', price === 0n || price >= 100000000n, 'price ' + price);
  add('contract_mints_left', BigInt(st.mints_left) > 0n);
  add('edition_output_index_1', !!ed && draft.outputs.indexOf(ed) === 1, 'sigScript hardcodes editionOutIdx = 1');
  add('artist_output_index_2', price === 0n || (!!art && draft.outputs.indexOf(art) === 2), 'sigScript hardcodes artistOutIdx = 2');
  add('edition_carrier_floor', !!ed && BigInt(ed.value) >= 100000000n);
  const est = CH.estimateFee(draft);
  add('fee_covers_estimate', draft.fee >= est, 'fee ' + draft.fee + ' est ' + est);
  return { ok: checks.every((c) => c.ok), checks, draft, safeJson: CH.toSafeJSON(draft), size: CH.estimateSize(draft), fee: draft.fee, summary: draft.summary };
}

// Wallet-returned tx vs the reviewed draft. Never throws.
function checkSigned(draft, signed) {
  try { const r = CH.verifySigned(draft, signed); return { ok: true, sigScripts: r.sigScripts, rpcTx: r.rpcTx }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = { planMint, checkSigned, classifyRejection, parseRequiredFee };
