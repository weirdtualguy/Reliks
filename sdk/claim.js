'use strict';
// Claim verification and self-authenticating ownership challenges (PROTOCOL.md section 11).
// Verification has zero external dependencies; signing (secret keys) uses @noble/curves.
const crypto = require('crypto');
const B2 = require('../web/blake2b.js');
const read = require('./read.js');
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const INTS = ['price', 'royalty_bips', 'serial', 'sales'];
const HEXES = ['ownerIdentifier', 'artist', 'program_hash', 'factory_covid', 'lineage'];

// Pure-BigInt secp256k1 BIP-340 Schnorr VERIFY (zero external dependencies; matches @noble/curves/secp256k1 schnorr). Variable-time: never feed it secrets.
const SECP_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const SECP_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const SECP_GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
const SECP_GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
function mod(a, m) { const r = a % m; return r >= 0n ? r : r + m; }
function modPow(b, e, m) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = (r * b) % m; e >>= 1n; b = (b * b) % m; } return r; }
function modInv(a, m) { return modPow(a, m - 2n, m); }
function ptAdd(P, Q) {
  if (!P) return Q; if (!Q) return P;
  const [x1, y1] = P, [x2, y2] = Q;
  if (x1 === x2 && y1 !== y2) return null;
  const lam = x1 === x2 ? mod(3n * x1 * x1 * modInv(2n * y1, SECP_P), SECP_P) : mod((y2 - y1) * modInv(x2 - x1, SECP_P), SECP_P);
  const x3 = mod(lam * lam - x1 - x2, SECP_P);
  return [x3, mod(lam * (x1 - x3) - y1, SECP_P)];
}
function ptMul(P, k) { let R = null, Q = P; while (k > 0n) { if (k & 1n) R = ptAdd(R, Q); Q = ptAdd(Q, Q); k >>= 1n; } return R; }
function liftX(x) {
  if (x <= 0n || x >= SECP_P) return null;
  const c = mod(modPow(x, 3n, SECP_P) + 7n, SECP_P);
  const y = modPow(c, (SECP_P + 1n) / 4n, SECP_P);
  if (mod(y * y, SECP_P) !== c) return null;
  return [x, (y & 1n) === 0n ? y : SECP_P - y];
}
function numTo32(n) { const b = Buffer.alloc(32); let v = n; for (let i = 31; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; } return b; }
function bytesToNum(u) { let v = 0n; for (let i = 0; i < u.length; i++) v = (v << 8n) | BigInt(u[i]); return v; }
function taggedSha256(tag, ...msgs) {
  const th = crypto.createHash('sha256').update(tag, 'utf8').digest();
  const h = crypto.createHash('sha256').update(th).update(th);
  for (const m of msgs) h.update(m);
  return h.digest();
}
// Secret-key operations use @noble/curves (constant-time scalar multiplication, random aux nonce).
// The pure-BigInt code in this file is variable-time and is therefore used ONLY for verification of public data.
function noble() {
  try { return require('@noble/curves/secp256k1').schnorr; }
  catch (e) { throw new Error('signing needs @noble/curves (npm ci); verification works without it'); }
}
function bip340Pubkey(privHex) {
  if (!HEX64.test(String(privHex))) throw new Error('invalid private key');
  return Buffer.from(noble().getPublicKey(Buffer.from(privHex, 'hex'))).toString('hex');
}
function bip340Sign(msg32, privHex) {
  if (!HEX64.test(String(privHex))) throw new Error('invalid private key');
  return Buffer.from(noble().sign(Buffer.from(msg32), Buffer.from(privHex, 'hex'))).toString('hex');
}
function bip340Verify(sigHex, msg32, pubHex) {
  try {
    if (!HEX128.test(String(sigHex)) || !HEX64.test(String(pubHex))) return false;
    const sig = Buffer.from(sigHex, 'hex'), pub = Buffer.from(pubHex, 'hex');
    const P = liftX(bytesToNum(pub));
    if (!P) return false;
    const r = bytesToNum(sig.subarray(0, 32)), s = bytesToNum(sig.subarray(32, 64));
    if (r >= SECP_P || s >= SECP_N) return false;
    const e = mod(bytesToNum(taggedSha256('BIP0340/challenge', sig.subarray(0, 32), pub, Buffer.from(msg32))), SECP_N);
    const R = ptAdd(ptMul([SECP_GX, SECP_GY], s), ptMul([P[0], SECP_P - P[1]], e));
    if (!R || (R[1] & 1n) !== 0n || R[0] !== r) return false;
    return true;
  } catch (err) { return false; }
}

function validateClaim(claim, network) {
  if (!claim || typeof claim !== 'object') return 'claim must be an object';
  if (claim.reliks_claim !== 1) return 'reliks_claim must be 1';
  if (typeof claim.network !== 'string' || !claim.network) return 'network missing';
  if (network !== undefined && claim.network !== network) return 'claim is for network ' + claim.network + ', expected ' + network;
  if (!HEX64.test(String(claim.covenantId))) return 'covenantId must be 64 lowercase hex';
  if (claim.outpoint !== undefined && !/^[0-9a-f]{64}:\d+$/.test(String(claim.outpoint))) return 'outpoint must be txid:index';
  const s = claim.state;
  if (!s || typeof s !== 'object') return 'state missing';
  for (const f of HEXES) if (!HEX64.test(String(s[f]))) return 'state.' + f + ' must be 64 lowercase hex';
  if (Number(s.identifierType) !== 0) return 'state.identifierType must be 0 (pubkey owners only)';
  for (const f of INTS) {
    const v = s[f];
    if (typeof v === 'number') { if (!Number.isSafeInteger(v) || v < 0) return 'state.' + f + ' must be a non-negative safe integer (use a decimal string for large values)'; }
    else if (typeof v !== 'string' || !/^\d+$/.test(v)) return 'state.' + f + ' must be a decimal string';
    if (BigInt(v) >= (1n << 63n)) return 'state.' + f + ' must be below 2^63';
  }
  return null;
}

// PROTOCOL.md section 11.1: Signed Ownership Challenge (ReliksOwnerChallengeV1)
function claimDigest(chain, claim) {
  const err = validateClaim(claim);
  if (err) throw new Error('invalid claim: ' + err);
  const s = claim.state;
  const st = { ownerIdentifier: s.ownerIdentifier, identifierType: 0, price: String(BigInt(s.price)), artist: s.artist, royalty_bips: String(BigInt(s.royalty_bips)), program_hash: s.program_hash, factory_covid: s.factory_covid, serial: String(BigInt(s.serial)), lineage: s.lineage, sales: String(BigInt(s.sales)) };
  const encState = Buffer.from(chain.encEditionState(st));
  const pre = Buffer.concat([Buffer.from('ReliksClaimV1', 'utf8'), Buffer.from(claim.network, 'utf8'), Buffer.from([0]), Buffer.from(claim.covenantId, 'hex'), encState]);
  return Buffer.from(B2.blake2b(new Uint8Array(pre), 32));
}

function ownershipChallengeDigest(chain, claim, challenge) {
  if (typeof challenge !== 'string' || !challenge.length) throw new Error('challenge must be a non-empty string');
  const cd = claimDigest(chain, claim);
  const pre = Buffer.concat([Buffer.from('ReliksOwnerChallengeV1', 'utf8'), cd, Buffer.from(challenge, 'utf8')]);
  return Buffer.from(B2.blake2b(new Uint8Array(pre), 32));
}

function signOwnershipChallenge(chain, claim, challenge, privHex) {
  if (typeof privHex !== 'string' || !/^[0-9a-f]{64}$/i.test(privHex)) throw new Error('private key must be 64 hex characters');
  const pub = bip340Pubkey(privHex.toLowerCase());
  if (pub !== String(claim && claim.state && claim.state.ownerIdentifier).toLowerCase()) throw new Error('private key does not match claim.state.ownerIdentifier');
  const msg = ownershipChallengeDigest(chain, claim, challenge);
  const sig = bip340Sign(msg, privHex.toLowerCase());
  return { scheme: 'ReliksOwnerChallengeV1', challenge, signature: sig };
}

function verifyOwnershipProof({ chain, claim, proof, expectedChallenge }) {
  const p = proof || (claim && claim.proof);
  if (!p || typeof p !== 'object') return { ok: false, reason: 'missing_proof' };
  if (p.scheme !== 'ReliksOwnerChallengeV1') return { ok: false, reason: 'unsupported_scheme' };
  if (typeof p.challenge !== 'string' || !p.challenge.length) return { ok: false, reason: 'empty_challenge' };
  if (expectedChallenge !== undefined && p.challenge !== expectedChallenge) return { ok: false, reason: 'challenge_mismatch' };
  if (!HEX128.test(String(p.signature))) return { ok: false, reason: 'malformed_signature' };
  let msg;
  try { msg = ownershipChallengeDigest(chain, claim, p.challenge); }
  catch (e) { return { ok: false, reason: 'invalid_claim' }; }
  const valid = bip340Verify(p.signature, msg, claim.state.ownerIdentifier);
  return valid ? { ok: true, owner: claim.state.ownerIdentifier, challenge: p.challenge, claimHash: claimDigest(chain, claim).toString('hex') } : { ok: false, reason: 'bad_signature' };
}

function seriesMatches(st, series) {
  try { return String(series.program_hash).toLowerCase() === st.program_hash && String(series.artist).toLowerCase() === st.artist && BigInt(series.royalty_bips) === BigInt(st.royalty_bips); }
  catch (e) { return false; }
}

function checkHistory(chain, us, st, truncated) {
  const spent = us.filter((u) => u.live !== true && typeof u.revealed_hex === 'string' && u.revealed_hex);
  let n = 0;
  for (const u of spent) {
    let h;
    try { h = chain.decodeEditionState(u.revealed_hex); } catch (e) { return { ok: false, detail: 'cannot decode a spent output: ' + String(e && e.message || e).slice(0, 80) }; }
    n++;
    const same = String(h.serial) === st.serial && String(h.program_hash).toLowerCase() === st.program_hash && String(h.artist).toLowerCase() === st.artist && BigInt(h.royalty_bips) === BigInt(st.royalty_bips) && String(h.factory_covid).toLowerCase() === st.factory_covid;
    if (!same) return { ok: false, detail: 'a spent output has a different serial, program, artist, royalty or factory' };
    if (BigInt(h.sales) > BigInt(st.sales)) return { ok: false, detail: 'a spent output has sales above the claim' };
  }
  return { ok: true, detail: n + ' spent output(s) consistent' + (truncated ? ' (history truncated)' : '') };
}

// a: { chain, io, claim, program?, series?, network?, tipAgeSec, maxTipAgeSec? }. chain = web/reliks-chain.js initialized with the v13 edition template.
async function verifyClaim(a) {
  const { chain, io, claim, program, series } = a || {};
  if (!chain || typeof chain.editionRedeem !== 'function' || !io || typeof io.covenant !== 'function') throw new Error('chain and io required');
  if (!chain.editionHasLineage()) throw new Error('chain must be initialized with the v13 edition template');
  const checks = [], add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });
  const out = (status, extra) => Object.assign({ ok: status === 'current', status, checks, provenance: 'unchecked' }, extra || {});
  const bad = validateClaim(claim, a.network);
  add('claim_format', !bad, bad || '');
  if (bad) return out('invalid_claim');
  const s = claim.state;
  const st = { ownerIdentifier: s.ownerIdentifier, identifierType: 0, price: String(BigInt(s.price)), artist: s.artist, royalty_bips: String(BigInt(s.royalty_bips)), program_hash: s.program_hash, factory_covid: s.factory_covid, serial: String(BigInt(s.serial)), lineage: s.lineage, sales: String(BigInt(s.sales)) };
  let exp;
  try { exp = chain.p2shSpk(chain.editionRedeem(st)).toLowerCase(); add('state_encodes', true); }
  catch (e) { add('state_encodes', false, String(e && e.message || e)); return out('invalid_claim'); }
  if (series) { const ok = seriesMatches(st, series); add('matches_series', ok, ok ? '' : 'program_hash, artist or royalty_bips differs'); if (!ok) return out('series_mismatch'); }
  if (program) {
    const r = read.verifyEdition({ program, state: st });
    r.checks.forEach((c) => add(c.name === 'program_hash' ? 'program_hash' : 'program_' + c.name, c.ok, c.detail));
    if (!r.ok) return out('program_mismatch');
  }
  let kj;
  try { kj = await io.covenant(claim.covenantId); }
  catch (e) { add('kascov', false, String(e && e.message || e)); return out('unreachable'); }
  const us = Array.isArray(kj && kj.utxos) ? kj.utxos : [];
  const spkOf = (u) => chain.stripVersion(String(u.script_hex || '')).toLowerCase();
  const matches = us.filter((u) => spkOf(u) === exp), live = matches.filter((u) => u.live === true);
  const age = a.tipAgeSec, max = a.maxTipAgeSec == null ? 600 : a.maxTipAgeSec;
  const fresh = typeof age === 'number' && isFinite(age) && age <= max;
  const stale = (observed, extra) => { add('freshness', false, typeof age === 'number' ? 'tip age ' + age + ' s > ' + max : 'tip age not supplied'); return out('index_stale', Object.assign({ observed }, extra || {})); };
  if (!live.length) {
    if (matches.length) { add('chain', false, 'the claimed state matches only spent output(s)'); return out('stale_state', { spentOutputs: matches.length }); }
    add('chain', false, 'no output of this covenant has the claimed state');
    return fresh ? out('absent') : stale('absent');
  }
  if (live.length > 1) { add('chain', false, live.length + ' live outputs have the claimed state'); return out('ambiguous'); }
  const lo = live[0].outpoint;
  if (claim.outpoint && claim.outpoint !== lo) { add('outpoint', false, 'claim says ' + claim.outpoint.slice(0, 14) + ', live output is ' + String(lo).slice(0, 14)); return out('outpoint_mismatch', { outpoint: lo }); }
  const h = checkHistory(chain, us, st, kj && kj.utxos_truncated === true);
  add('history', h.ok, h.detail);
  if (!h.ok) return out('history_conflict', { outpoint: lo });
  add('chain', true, 'live at ' + String(lo).slice(0, 14));
  let prov = { level: 'unchecked', detail: 'skipped' };
  if (a.provenance !== false) prov = await checkProvenance({ chain, io, covenantId: claim.covenantId, st, kj, fresh });
  add('provenance', ['listed_and_derived', 'listed', 'unchecked'].indexOf(prov.level) >= 0, prov.level + (prov.detail ? ': ' + prov.detail : ''));
  if (['unlisted', 'inconsistent', 'mismatch'].indexOf(prov.level) >= 0) return out('provenance_failed', { outpoint: lo, provenance: prov.level });
  if (claim.proof || a.proof || a.requireProof) {
    const pr = verifyOwnershipProof({ chain, claim, proof: a.proof || claim.proof, expectedChallenge: a.expectedChallenge });
    add('ownership_proof', pr.ok, pr.ok ? 'signed by ' + pr.owner.slice(0, 12) + '…' : pr.reason);
    if (!pr.ok) return out('proof_failed', { outpoint: lo, provenance: prov.level, proofError: pr.reason });
  }
  return fresh ? out('current', { outpoint: lo, provenance: prov.level }) : stale('current', { outpoint: lo, provenance: prov.level });
}

// Provenance (PROTOCOL.md section 11): was this covenant born in a mint of the claimed lane, and does its genesis state follow from that mint?
// Levels: listed_and_derived | listed | unchecked (no evidence either way) | unlisted | inconsistent | mismatch (evidence against).
async function checkProvenance({ chain, io, covenantId, st, kj, fresh }) {
  let lane;
  try { lane = await io.covenant(st.factory_covid); } catch (e) { return { level: 'unchecked', detail: 'lane record unavailable' }; }
  const evs = Array.isArray(lane && lane.events) ? lane.events : [];
  const complete = !!lane && lane.events_truncated !== true && Number(lane.event_count) === evs.length;
  const hit = evs.find((e) => e && e.kind === 'transition' && Array.isArray(e.with_covenants) && e.with_covenants.indexOf(covenantId) >= 0);
  if (!hit) return complete && fresh ? { level: 'unlisted', detail: 'no mint event of the claimed lane lists this covenant' } : { level: 'unchecked', detail: 'lane record incomplete or index not fresh' };
  if (!kj || kj.genesis_txid !== hit.txid) return { level: 'inconsistent', detail: 'the covenant genesis tx is not the lane event tx' };
  const prev = (Array.isArray(lane.utxos) ? lane.utxos : []).find((u) => u && u.spent_txid === hit.txid);
  if (!prev || !/^[0-9a-f]{64}:\d+$/.test(String(prev.outpoint))) return { level: 'listed', detail: 'the lane input outpoint of the mint is not available' };
  if (kj.utxos_truncated === true) return { level: 'listed', detail: 'edition output list truncated; genesis state not checked' };
  const spent = (Array.isArray(kj.utxos) ? kj.utxos : []).filter((u) => u && u.live !== true);
  let g;
  if (!spent.length) g = st;
  else {
    const first = spent.slice().sort((x, y) => Number(x.created_daa) - Number(y.created_daa))[0];
    if (!first || typeof first.revealed_hex !== 'string' || !first.revealed_hex) return { level: 'listed', detail: 'the earliest output has no revealed script' };
    try { g = chain.decodeEditionState(first.revealed_hex); } catch (e) { return { level: 'listed', detail: 'the earliest output cannot be decoded' }; }
  }
  const op = String(prev.outpoint).split(':'), ptx = op[0], pidx = Number(op[1]);
  const ok = String(g.lineage).toLowerCase() === chain.genesisLineage(st.factory_covid, g.serial) && BigInt(g.sales) === 0n && BigInt(g.price) === 0n && String(g.factory_covid).toLowerCase() === st.factory_covid;
  return ok ? { level: 'listed_and_derived', detail: 'listed in a lane mint; genesis state follows from the lane input' } : { level: 'mismatch', detail: 'the genesis state does not follow from the lane input of the mint' };
}

function claimFromLedger(ledger, i, opts) {
  const e = ledger.editions && ledger.editions[i], s = ledger.series;
  if (!e) throw new Error('edition not in ledger');
  return { reliks_claim: 1, network: (opts && opts.network) || 'testnet-10', covenantId: e.cov, state: { ownerIdentifier: e.owner, identifierType: 0, price: String(e.price), artist: s.artist, royalty_bips: String(s.royalty_bips), program_hash: s.program_hash, factory_covid: ledger.C, serial: String(e.serial), lineage: e.lineage, sales: String(e.sales) }, outpoint: e.txId + ':' + e.index, source: 'ledger' };
}
module.exports = { validateClaim, verifyClaim, claimFromLedger, claimDigest, ownershipChallengeDigest, signOwnershipChallenge, verifyOwnershipProof, bip340Pubkey, bip340Sign, bip340Verify };
