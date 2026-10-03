'use strict';
// Read-only helpers for the v6 offer escrow: state encoding, script rebuild from the ABI template, commitment check. No key, no network.
const B2 = require('../web/blake2b.js');
const FIELDS = [['ownerIdentifier', 32], ['identifierType', 1], ['edition_covid', 32], ['askPrice', 8], ['expireAge', 8], ['artist', 32], ['royalty_bips', 8], ['offerer', 32]];
const hexOf = (u) => Buffer.from(u).toString('hex');
function unhex(s) { if (typeof s !== 'string' || s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('bad hex'); return Buffer.from(s, 'hex'); }
const push = (b) => { if (b.length > 75) throw new Error('push too long'); return Buffer.concat([Buffer.from([b.length]), b]); };
function encodeEscrowState(s) {
  if (!s || typeof s !== 'object') throw new Error('state required');
  const out = [];
  for (const [name, w] of FIELDS) {
    const v = s[name];
    if (v === undefined || v === null) throw new Error('state field missing: ' + name);
    if (w === 8) {
      let x; try { x = BigInt(v); } catch (e) { throw new Error('bad int: ' + name); }
      if (x < 0n || x >= (1n << 63n)) throw new Error('state int out of range: ' + name);
      const b = Buffer.alloc(8); b.writeBigUInt64LE(x); out.push(push(b));
    } else if (w === 1) {
      const x = Number(v);
      if (!Number.isInteger(x) || x < 0 || x > 255) throw new Error('bad byte: ' + name);
      out.push(push(Buffer.from([x])));
    } else {
      const b = unhex(String(v));
      if (b.length !== w) throw new Error('state field ' + name + ' must be ' + w + ' bytes');
      out.push(push(b));
    }
  }
  return Buffer.concat(out);
}
function templateParts(abi) {
  const c = abi.contracts[Object.keys(abi.contracts)[0]], bc = Buffer.from(c.compiled.bytecode), sp = c.compiled.state_span;
  return { prefix: bc.subarray(0, sp.offset), suffix: bc.subarray(sp.offset + sp.len), span: sp, names: c.runtime_state.fields.map((f) => f.name) };
}
function escrowRedeem(abi, state) {
  const p = templateParts(abi), e = encodeEscrowState(state);
  if (e.length !== p.span.len) throw new Error('encoded state is ' + e.length + ' B, template span is ' + p.span.len);
  return Buffer.concat([p.prefix, e, p.suffix]);
}
function escrowSpk(abi, state) { return 'aa20' + hexOf(B2.blake2b(new Uint8Array(escrowRedeem(abi, state)), 32)) + '87'; }
function verifyEscrowScript({ abi, state, spk }) {
  const checks = [], add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });
  let p; try { p = templateParts(abi); } catch (e) { add('abi', false, String(e.message)); return { ok: false, checks }; }
  add('field_names', JSON.stringify(p.names) === JSON.stringify(FIELDS.map((f) => f[0])), p.names.join(','));
  let exp = null;
  try { exp = escrowSpk(abi, state); add('state_encodes_to_span', true, p.span.len + ' B'); } catch (e) { add('state_encodes_to_span', false, String(e.message)); }
  if (exp) { const n = require('./read.js').normSpk(spk); add('script_commitment', n.spk === exp, exp.slice(0, 8) + '/' + exp.length + ' vs ' + n.spk.slice(0, 8) + '/' + n.spk.length); }
  return { ok: checks.every((c) => c.ok), checks };
}
module.exports = { FIELDS, encodeEscrowState, escrowRedeem, escrowSpk, verifyEscrowScript, templateParts };
