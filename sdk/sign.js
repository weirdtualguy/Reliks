'use strict';
// Signature hash and Schnorr signing for an SDK mint draft. Mirrors reliks-lib.js sighash (the function that signed the recorded mints); proven equal on sdk/sighash-vectors.json.
// No network, never reads the environment: the private key is always a parameter, and nothing here prints or stores it.
const B2 = require('../web/blake2b.js');
const { schnorr } = require('@noble/curves/secp256k1');
const KEY = new TextEncoder().encode('TransactionSigningHash');
const hash = (b) => Buffer.from(B2.blake2b(new Uint8Array(b), 32, KEY));
const le16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const le32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const le64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const hx = (s) => { if (typeof s !== 'string' || s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('bad hex'); return Buffer.from(s, 'hex'); };
const varB = (b) => Buffer.concat([le64(b.length), b]);

function sigHash(draft, idx) {
  if (!draft || draft.version !== 1 || BigInt(draft.lockTime) !== 0n || BigInt(draft.gas) !== 0n || draft.payload !== '') throw new Error('unsupported transaction fields (version 1, lockTime 0, gas 0, empty payload only)');
  const ins = draft.inputs, outs = draft.outputs;
  if (!Array.isArray(ins) || !Array.isArray(outs) || !Number.isInteger(idx) || idx < 0 || idx >= ins.length) throw new Error('input index out of range');
  const poh = hash(Buffer.concat(ins.map((i) => Buffer.concat([hx(i.txId), le32(i.index)]))));
  const seqh = hash(Buffer.concat(ins.map((i) => le64(i.sequence || 0))));
  const ohv = hash(Buffer.concat(outs.map((o) => {
    const p = [le64(o.value), le16(0), varB(hx(o.spk))];
    if (o.covenant) p.push(Buffer.from([1]), le16(o.covenant.authorizingInput), hx(o.covenant.covenantId)); else p.push(Buffer.from([0]));
    return Buffer.concat(p);
  })));
  const i = ins[idx];
  return hash(Buffer.concat([le16(1), poh, seqh, hx(i.txId), le32(i.index), le16(0), varB(hx(i.utxo.spk)), le64(i.utxo.amount), le64(i.sequence || 0), ohv, le64(0), Buffer.alloc(20), le64(0), Buffer.alloc(32), Buffer.from([1])]));
}

function signInput(draft, idx, privHex) {
  if (typeof privHex !== 'string' || !/^[0-9a-f]{64}$/i.test(privHex)) throw new Error('private key must be 64 hex characters');
  const inp = draft && draft.inputs && draft.inputs[idx];
  if (!inp || !inp.utxo || inp.utxo.sign !== true) throw new Error('input ' + idx + ' is not a wallet input');
  const priv = Uint8Array.from(Buffer.from(privHex, 'hex'));
  const pub = Buffer.from(schnorr.getPublicKey(priv)).toString('hex');
  if (String(inp.utxo.spk).toLowerCase() !== '20' + pub + 'ac') throw new Error('this key does not own input ' + idx);
  const sig = schnorr.sign(new Uint8Array(sigHash(draft, idx)), priv);
  return '41' + Buffer.from(sig).toString('hex') + '01';
}

// Returns the draft as SafeJSON-shaped JSON with every wallet input signed; pass it to plan.checkSigned before anything is sent.
function signWallet(chain, draft, privHex) {
  const s = JSON.parse(chain.toSafeJSON(draft));
  draft.inputs.forEach((i, k) => { if (i.utxo.sign) s.inputs[k].signatureScript = signInput(draft, k, privHex); });
  return s;
}
module.exports = { sigHash, signInput, signWallet };
