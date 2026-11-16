/* Reliks chain library: everything the browser (and the tests) need to read
   Reliks state from Kaspa and to build series deployment, mint, and secondary
   market (list, unlist, buy, transfer, and 2-party atomic bids/offers) transactions.

   Zero dependencies. Depends only on ReliksBlake2b (web/blake2b.js).
   Nothing here talks to a wallet; see web/kaspire.js for that.

   Trust model, in one paragraph: every value that comes from a network
   service (kascov, the Kaspa REST API) is treated as a claim. Claims are
   recomputed locally (script hashes, serials, covenant ids) and compared to
   what the chain says. A mismatch fails closed: no art is presented as
   verified and no transaction is built. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./blake2b.js'));
  else root.ReliksChain = factory(root.ReliksBlake2b);
})(typeof self !== 'undefined' ? self : this, function (B2) {
  'use strict';

  var SOMPI = 100000000n;
  var CARRIER = SOMPI;            // 1 KAS stays in the edition UTXO
  var LANE_BUDGET = 100;          // compute budget of covenant inputs (same as the Node builders)
  var P2PK_BUDGET = 10;
  var FEE_PER_BYTE = 200n;        // sompi per serialized tx byte (mainnet mempool policy, see docs/ENGINEERING-NOTES.md)
  var MIN_CHANGE = 1000000n;      // below this, change is folded into the fee
  var MAX_PRICE = 922337203685477n; // contract i64 overflow guard for price * royalty_bips

  /* ------------------------------------------------------------ bytes */
  function hex2u8(h) {
    if (typeof h !== 'string' || h.length % 2 || /[^0-9a-fA-F]/.test(h)) throw new Error('bad hex');
    var u = new Uint8Array(h.length / 2);
    for (var i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16);
    return u;
  }
  function u8hex(u) { var s = ''; for (var i = 0; i < u.length; i++) s += (u[i] < 16 ? '0' : '') + u[i].toString(16); return s; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function cat(a) {
    var n = 0, i; for (i = 0; i < a.length; i++) n += a[i].length;
    var o = new Uint8Array(n), off = 0;
    for (i = 0; i < a.length; i++) { o.set(a[i], off); off += a[i].length; }
    return o;
  }
  function le16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
  function le32(n) { var b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, Number(n), true); return b; }
  function le64(v) { var b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; }
  function hash(bytes, key) { return B2.blake2b(bytes, 32, key ? utf8(key) : undefined); }
  function hashHex(bytes) { return u8hex(hash(bytes)); }

  /* ------------------------------------------------------------ script pushes */
  function pushExp(p) {           // explicit push, used for state (KCC-1)
    var n = p.length;
    if (n === 0) return new Uint8Array([0]);
    if (n <= 75) return cat([new Uint8Array([n]), p]);
    if (n <= 255) return cat([new Uint8Array([76, n]), p]);
    return cat([new Uint8Array([77]), le16(n), p]);
  }
  function pushMin(p) {           // minimal push, used for signature-script arguments
    var n = p.length;
    if (n === 0) return new Uint8Array([0]);
    if (n === 1) {
      var b = p[0];
      if (b >= 1 && b <= 16) return new Uint8Array([80 + b]);
      if (b === 129) return new Uint8Array([79]);
      return cat([new Uint8Array([1]), p]);
    }
    return pushExp(p);
  }
  function pushMinInt(v) {
    var n = BigInt(v);
    if (n === 0n) return new Uint8Array([0]);
    if (n >= 1n && n <= 16n) return new Uint8Array([80 + Number(n)]);
    if (n === -1n) return new Uint8Array([79]);
    var neg = n < 0n, mag = neg ? -n : n;
    var h = mag.toString(16); if (h.length % 2) h = '0' + h;
    var a = hex2u8(h).reverse();
    if (a[a.length - 1] & 128) return cat([new Uint8Array([a.length + 1]), a, new Uint8Array([neg ? 128 : 0])]);
    if (neg) a[a.length - 1] |= 128;
    return cat([new Uint8Array([a.length]), a]);
  }

  /* ------------------------------------------------------------ state codec */
  var MIN_ROYALTY_OUT = 5000000n;  // 0.05 KAS royalty mineability floor
  var MIN_ROYALTY_BIPS = 500n;     // 5% minimum royalty

  // Canonical state layouts (SeriesFactory: 8 fields / 144 B; ReliksEdition: 10 fields / 203 B; OfferEscrow: 8 fields / 161 B).
  var ED = [['ownerIdentifier', 32], ['identifierType', 1], ['price', 8], ['artist', 32], ['royalty_bips', 8], ['program_hash', 32], ['factory_covid', 32], ['serial', 8], ['lineage', 32], ['sales', 8]];
  var FC = [['program_hash', 32], ['artist', 32], ['price', 8], ['royalty_bips', 8], ['mints_left', 8], ['engine_lang', 8], ['render_hash', 32], ['next_serial', 8]];
  var ES = [['ownerIdentifier', 32], ['identifierType', 1], ['edition_covid', 32], ['askPrice', 8], ['expireAge', 8], ['artist', 32], ['royalty_bips', 8], ['offerer', 32]];
  function editionHasLineage() { return true; }
  function encFields(tbl, s) {
    var out = [];
    for (var i = 0; i < tbl.length; i++) {
      var n = tbl[i][0], w = tbl[i][1], v = s[n];
      if (v === undefined || v === null) throw new Error('state field missing: ' + n);
      if (w === 8) {
        var x = BigInt(v);
        if (x < 0n || x >= (1n << 63n)) throw new Error('state int out of range: ' + n);
        out.push(pushExp(le64(x)));
      } else if (w === 1) out.push(pushExp(new Uint8Array([Number(v) & 255])));
      else {
        var bytes = hex2u8(v);
        if (bytes.length !== w) throw new Error('state field ' + n + ' must be ' + w + ' bytes');
        out.push(pushExp(bytes));
      }
    }
    return cat(out);
  }
  function encFactoryState(s) {
    var st = (s && (s.next_serial === undefined || s.next_serial === null)) ? Object.assign({}, s, { next_serial: 0n }) : s;
    return encFields(FC, st);
  }
  function encEditionState(s) { return encFields(ED, s); }
  function encEscrowState(s) { return encFields(ES, s); }

  var TPL = null;
  function init(templates) {
    if (!templates || !templates.factory || !templates.edition) throw new Error('templates missing');
    TPL = templates;
    return api;
  }
  function tpl() { if (!TPL) throw new Error('ReliksChain.init(templates) not called'); return TPL; }
  function redeem(t, encoded) { return cat([hex2u8(t.prefixHex), encoded, hex2u8(t.suffixHex)]); }

  // Synthesize the exact SeriesFactory suffix (contracts/factory.json, 029512ea…) for any Reliks-VM program
  // (1..25641 B) without needing silverc in the browser. Reproduces tpl().factory.suffixHex byte-for-byte.
  function buildFactorySuffix(progBytes, edTemplate) {
    var baseSuf = hex2u8(tpl().factory.suffixHex);
    var edTpl = edTemplate || tpl().edition;
    var prog = progBytes instanceof Uint8Array ? progBytes : hex2u8(progBytes);
    if (prog.length < 1 || prog.length > 25641) throw new Error('program length must be 1..25641 bytes');
    var pushProg = pushMin(prog);
    var pushEd = pushMin(hex2u8(edTpl.suffixHex));
    var pushTh = pushMin(hex2u8(edTpl.templateHashHex));
    var c0 = baseSuf.subarray(0, 76);
    var c1 = baseSuf.subarray(3967, 4009);
    var c2 = baseSuf.subarray(7900, 7985);
    var c3 = baseSuf.subarray(8018, 8030);
    var c4 = baseSuf.subarray(10428, 10435);
    var c5 = baseSuf.subarray(12833, 12908);
    var tailHex = u8hex(baseSuf.subarray(15306));
    var headLen = c0.length + pushProg.length + c1.length + pushProg.length + c2.length + pushTh.length + c3.length + pushEd.length + c4.length + pushEd.length + c5.length + pushEd.length;
    var oldPat = 'b976c902414194765193bc7c7eb976c97602b0c0937cbc';
    var patchedTail = hex2u8(tailHex);
    for (var iter = 0; iter < 3; iter++) {
      var sufLen = headLen + patchedTail.length;
      var totLen = 145 + sufLen;
      var newPat = 'b976c9' + u8hex(pushMinInt(totLen)) + '94765193bc7c7eb976c976' + u8hex(pushMinInt(-sufLen)) + '937cbc';
      patchedTail = hex2u8(tailHex.split(oldPat).join(newPat));
    }
    return cat([c0, pushProg, c1, pushProg, c2, pushTh, c3, pushEd, c4, pushEd, c5, pushEd, patchedTail]);
  }
  function buildFactoryRedeem(state, progBytes, edTemplate) {
    if (!progBytes) return redeem(tpl().factory, encFactoryState(state));
    return cat([hex2u8(tpl().factory.prefixHex), encFactoryState(state), buildFactorySuffix(progBytes, edTemplate)]);
  }
  function factoryRedeem(s, progBytes, edTemplate) { return buildFactoryRedeem(s, progBytes, edTemplate); }
  function editionRedeem(s, edTemplate) { return redeem(edTemplate || tpl().edition, encEditionState(s)); }
  function escrowRedeem(s, escTemplate) { return redeem(escTemplate || tpl().escrow, encEscrowState(s)); }
  function p2shSpk(redeemBytes) { return 'aa20' + u8hex(hash(redeemBytes)) + '87'; }
  function p2pkSpk(pubkeyHex) { return '20' + pubkeyHex + 'ac'; }

  /* ------------------------------------------------------------ serial, lineage, and covenant id */
  function genesisLineage(factoryCovId, serial) { return u8hex(hash(cat([utf8('ReliksGenesisV2'), hex2u8(factoryCovId), le64(serial)]))); }
  function genesisLineageCounter(factoryCovId, serial) { return genesisLineage(factoryCovId, serial); }
  function advanceLineage(prevHex, ownerHex) { return u8hex(hash(cat([utf8('ReliksLineageV2'), hex2u8(prevHex), hex2u8(ownerHex)]))); }
  function covenantIdGenesis(authTxId, authIndex, outs) {
    var parts = [hex2u8(authTxId), le32(authIndex), le64(outs.length)];
    for (var i = 0; i < outs.length; i++) {
      var o = outs[i], sc = hex2u8(o.script);
      parts.push(cat([le32(o.idx), le64(o.value), le16(0), le64(sc.length), sc]));
    }
    return u8hex(hash(cat(parts), 'CovenantID'));
  }

  /* ------------------------------------------------------------ Kaspa addresses (encode + decode) */
  var B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function polymod(values) {
    var GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
    var c = 1n;
    for (var i = 0; i < values.length; i++) {
      var c0 = c >> 35n;
      c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(values[i]);
      for (var g = 0; g < 5; g++) if ((c0 >> BigInt(g)) & 1n) c ^= GEN[g];
    }
    return c ^ 1n;
  }
  function to5(bytes) {
    var out = [], acc = 0, bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      acc = (acc << 8) | bytes[i]; bits += 8;
      while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); acc &= (1 << bits) - 1; }
    }
    if (bits > 0) out.push((acc << (5 - bits)) & 31);
    return out;
  }
  function from5(words) {
    var out = [], acc = 0, bits = 0;
    for (var i = 0; i < words.length; i++) {
      var v = words[i];
      if (v < 0 || v > 31) throw new Error('invalid bech32 word');
      acc = (acc << 5) | v; bits += 5;
      while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; }
    }
    if (bits >= 5 || ((acc << (8 - bits)) & 255)) throw new Error('invalid bech32 padding');
    return new Uint8Array(out);
  }
  function encodeAddress(hrp, versionByte, payload) {
    var five = to5([versionByte].concat(Array.prototype.slice.call(payload)));
    var pre = []; for (var i = 0; i < hrp.length; i++) pre.push(hrp.charCodeAt(i) & 31);
    var chk = polymod(pre.concat([0], five, [0, 0, 0, 0, 0, 0, 0, 0]));
    var cb = []; for (i = 0; i < 5; i++) cb.push(Number((chk >> BigInt((4 - i) * 8)) & 255n));
    var all = five.concat(to5(cb)), s = '';
    for (i = 0; i < all.length; i++) s += B32[all[i]];
    return hrp + ':' + s;
  }
  function decodeAddress(address) {
    var s = String(address || '').trim().toLowerCase();
    var sep = s.lastIndexOf(':');
    if (sep < 1) throw new Error('address missing hrp prefix (expected kaspa:...)');
    var hrp = s.slice(0, sep), rest = s.slice(sep + 1);
    if (rest.length < 8) throw new Error('address too short');
    var pre = [], vals = [], i;
    for (i = 0; i < hrp.length; i++) pre.push(hrp.charCodeAt(i) & 31);
    for (i = 0; i < rest.length; i++) {
      var idx = B32.indexOf(rest[i]);
      if (idx < 0) throw new Error('invalid character in address: ' + rest[i]);
      vals.push(idx);
    }
    if (polymod(pre.concat([0], vals)) !== 0n) throw new Error('address checksum failed');
    var raw = from5(vals.slice(0, -8));
    var payload = raw.subarray(1);
    return { hrp: hrp, version: raw[0], payload: payload, payloadHex: u8hex(payload) };
  }
  function parseOwnerInput(hrp, input) {
    var s = String(input || '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(s)) return { pubkey: s, address: p2pkAddress(hrp, s) };
    var dec = decodeAddress(s);
    if (hrp && dec.hrp !== hrp) throw new Error('address network mismatch: expected ' + hrp + ':');
    if (dec.version !== 0 || dec.payload.length !== 32) throw new Error('recipient must be a standard Schnorr P2PK address (kaspa:qp...) or 64-hex public key');
    return { pubkey: dec.payloadHex, address: s };
  }
  function p2pkAddress(hrp, pubkeyHex) { return encodeAddress(hrp, 0, hex2u8(pubkeyHex)); }
  function p2shAddress(hrp, spkHex) { return encodeAddress(hrp, 8, hex2u8(spkHex).subarray(2, 34)); }

  /* ------------------------------------------------------------ tolerant readers for REST and kascov */
  function pick(o, ks) { for (var i = 0; i < ks.length; i++) if (o && o[ks[i]] != null) return o[ks[i]]; return undefined; }
  function stripVersion(s) { return typeof s === 'string' && s.slice(0, 4) === '0000' ? s.slice(4) : s; }
  function spkOfOutput(o) {
    var s = pick(o, ['script_public_key', 'scriptPublicKey']);
    if (s && typeof s === 'object') s = pick(s, ['script_public_key', 'scriptPublicKey']);
    return typeof s === 'string' ? stripVersion(s) : undefined;
  }
  function outputValue(o) { var v = pick(o, ['amount', 'value']); return v === undefined ? undefined : BigInt(v); }
  function inputOutpoint(inp) {
    var p = pick(inp, ['previous_outpoint', 'previousOutpoint']);
    if (p) return { txId: pick(p, ['transaction_id', 'transactionId']), index: Number(p.index) };
    var h = pick(inp, ['previous_outpoint_hash', 'previousOutpointHash']);
    if (h == null) return undefined;
    return { txId: h, index: Number(pick(inp, ['previous_outpoint_index', 'previousOutpointIndex'])) };
  }
  function covenantOf(o) {
    var c = o.covenant;
    if (c && typeof c === 'object') return { authorizingInput: pick(c, ['authorizingInput', 'authorizing_input']), id: pick(c, ['covenantId', 'covenant_id']) };
    return { authorizingInput: pick(o, ['covenant_authorizing_input', 'covenantAuthorizingInput']), id: pick(o, ['covenant_id', 'covenantId']) };
  }
  function parsePushes(h) {
    var b = hex2u8(h), out = [], o = 0;
    while (o < b.length) {
      var op = b[o++], len;
      if (op === 0) { out.push(''); continue; }
      if (op === 79) { out.push('81'); continue; }
      if (op >= 81 && op <= 96) { var v = op - 80; out.push((v < 16 ? '0' : '') + v.toString(16)); continue; }
      if (op <= 75) len = op;
      else if (op === 76) len = b[o++];
      else if (op === 77) { len = b[o] + b[o + 1] * 256; o += 2; }
      else throw new Error('non-push opcode in script: ' + op);
      out.push(u8hex(b.subarray(o, o + len))); o += len;
    }
    return out;
  }
  function u64le(h) { var b = hex2u8(h), v = 0n; for (var i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; }
  function parseScriptInt(h) {
    if (!h) return 0n;
    var b = hex2u8(h);
    if (!b.length) return 0n;
    var neg = (b[b.length - 1] & 128) !== 0;
    b[b.length - 1] &= 127;
    var v = 0n;
    for (var i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
    return neg ? -v : v;
  }
  function decodeFactoryState(revealedHex) {
    var span = tpl().factory.span;
    var pushes = parsePushes(revealedHex.slice(span.offset * 2, (span.offset + span.len) * 2));
    if (pushes.length !== 8) throw new Error('factory state has ' + pushes.length + ' fields, expected 8');
    return { program_hash: pushes[0], artist: pushes[1], price: u64le(pushes[2]), royalty_bips: u64le(pushes[3]), mints_left: u64le(pushes[4]), engine_lang: u64le(pushes[5]), render_hash: pushes[6], next_serial: u64le(pushes[7]) };
  }
  function decodeEditionState(revealedHex, edTpl) {
    var et = edTpl || tpl().edition;
    var span = et.span;
    var p = parsePushes(revealedHex.slice(span.offset * 2, (span.offset + span.len) * 2));
    if (p.length !== 10) throw new Error('edition state has ' + p.length + ' fields, expected 10');
    return { ownerIdentifier: p[0], identifierType: Number(u64le(p[1])), price: u64le(p[2]), artist: p[3], royalty_bips: u64le(p[4]), program_hash: p[5], factory_covid: p[6], serial: u64le(p[7]).toString(), lineage: p[8], sales: u64le(p[9]) };
  }
  function decodeEscrowState(revealedHex, escTpl) {
    var et = escTpl || tpl().escrow;
    var span = et.span;
    var p = parsePushes(revealedHex.slice(span.offset * 2, (span.offset + span.len) * 2));
    if (p.length !== 8) throw new Error('escrow state has ' + p.length + ' fields, expected 8');
    return { ownerIdentifier: p[0], identifierType: Number(u64le(p[1])), edition_covid: p[2], askPrice: u64le(p[3]), expireAge: u64le(p[4]), artist: p[5], royalty_bips: u64le(p[6]), offerer: p[7] };
  }

  /* ------------------------------------------------------------ chain access (injected fetch, so tests can mock) */
  function makeIO(cfg, fetchImpl) {
    var f = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (!f) throw new Error('no fetch available');
    async function json(url) {
      var r = await f(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(url.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/') + ' answered ' + r.status);
      return r.json();
    }
    return {
      tx: function (id) { return json(cfg.rest + '/transactions/' + id); },
      covenant: function (id) { return json(cfg.kascov + '/c/' + id + '.json'); },
      utxos: function (address) { return json(cfg.rest + '/addresses/' + address + '/utxos'); }
    };
  }

  /* ------------------------------------------------------------ series resolution */
  async function resolveLane(io, series, opts) {
    opts = opts || {};
    var progBytes = opts.progBytes || series._progBytes || null;
    var edTpl = opts.editionTemplate || series._editionTemplate || null;
    var kj = await io.covenant(series.laneCovenantId);
    var utxos = kj.utxos || [];
    var live = utxos.filter(function (u) { return u.live === true; });
    var kinds = (kj.events || []).map(function (e) { return e.kind; });
    var odd = kinds.filter(function (k) { return k !== 'transition' && k !== 'genesis' && k !== 'mint'; });
    if (live.length !== 1) throw new Error('lane has ' + live.length + ' live outputs (forked or closed); use the CLI');
    if (odd.length) throw new Error('lane history contains "' + odd[0] + '" events; the browser only follows plain mint chains');
    var liveOp = live[0].outpoint.split(':');
    var laneTx = liveOp[0], laneIdx = Number(liveOp[1]);
    var state, source;
    if (laneTx === series.genesisTxId) {
      if (!series.genesisState) throw new Error('series registry lacks genesisState for an unspent lane');
      var g = series.genesisState;
      state = { program_hash: g.program_hash, artist: g.artist, price: BigInt(g.price), royalty_bips: BigInt(g.royalty_bips), mints_left: BigInt(g.mints_left), engine_lang: BigInt(g.engine_lang != null ? g.engine_lang : 2), render_hash: g.render_hash, next_serial: BigInt(g.next_serial != null ? g.next_serial : 0) };
      source = 'registry';
    } else {
      var mintTx = await io.tx(laneTx);
      var prev = inputOutpoint(mintTx.inputs[0]);
      var spent = utxos.filter(function (u) { return u.outpoint === prev.txId + ':' + prev.index && u.revealed_hex; })[0];
      if (!spent) throw new Error('previous lane output has no revealed script in kascov');
      var st = decodeFactoryState(spent.revealed_hex);
      state = { program_hash: st.program_hash, artist: st.artist, price: st.price, royalty_bips: st.royalty_bips, mints_left: st.mints_left - 1n, engine_lang: st.engine_lang, render_hash: st.render_hash, next_serial: st.next_serial + 1n };
      source = 'chain';
      if (state.mints_left < 0n) throw new Error('lane state underflow');
    }
    var expectSpk = p2shSpk(factoryRedeem(state, progBytes, edTpl));
    var liveSpk = stripVersion(String(live[0].script_hex || ''));
    if (liveSpk && liveSpk !== expectSpk) throw new Error('lane script does not match its decoded state (template drift)');
    return {
      state: state, source: source, spk: expectSpk,
      outpoint: { txId: laneTx, index: laneIdx },
      value: BigInt(live[0].value != null ? live[0].value : kj.live_value),
      covenantId: series.laneCovenantId,
      progBytes: progBytes, editionTemplate: edTpl
    };
  }

  /* ------------------------------------------------------------ edition live-state resolution (secondary market) */
  function applyEditionTransition(prevState, sigScriptHex, edTpl) {
    var pushes = parsePushes(sigScriptHex);
    if (pushes.length < 2) throw new Error('edition input signatureScript too short');
    var tag = pushes[pushes.length - 2];
    var next = Object.assign({}, prevState);
    var hasLin = editionHasLineage(edTpl);
    if (tag === '674a8ea4') { // list(newPrice, ownerSig)
      next.price = parseScriptInt(pushes[0]);
    } else if (tag === '88709f25') { // unlist(ownerSig)
      next.price = 0n;
    } else if (tag === '1cd4096a' || tag === '89cfc99a') { // buy(buyer, 1, 2) or sell(buyer, price, 1, 2, sig)
      var buyer = pushes[0];
      next.ownerIdentifier = buyer;
      next.price = 0n;
      if (hasLin) {
        next.lineage = advanceLineage(prevState.lineage, buyer);
        next.sales = BigInt(prevState.sales || 0) + 1n;
      }
    } else if (tag === '794dca54') { // transfer(newOwner, ownerSig)
      var rec = pushes[0];
      next.ownerIdentifier = rec;
      next.price = 0n;
      if (hasLin) next.lineage = advanceLineage(prevState.lineage, rec);
    } else {
      throw new Error('unsupported edition transition tag: ' + tag);
    }
    return next;
  }

  async function resolveEdition(io, series, ed, edTemplate) {
    var edTpl = edTemplate || series._editionTemplate || tpl().edition;
    var hasLin = editionHasLineage(edTpl);
    var royBips = BigInt(ed.royalty_bips != null ? ed.royalty_bips : (series.royalty_bips != null ? series.royalty_bips : (series.genesisState && series.genesisState.royalty_bips) || 500));
    var mintState = {
      ownerIdentifier: ed.ownerAtMint, identifierType: 0, price: 0n,
      artist: series.artist, royalty_bips: royBips,
      program_hash: series.programHash, factory_covid: series.laneCovenantId,
      serial: String(ed.serial)
    };
    mintState.lineage = ed.lineage || genesisLineage(series.laneCovenantId, ed.serial);
    mintState.sales = BigInt(ed.sales || 0);
    var kj = null;
    try { kj = await io.covenant(ed.covenantId); } catch (e) { kj = null; }
    var utxos = (kj && kj.utxos) || [];
    var live = utxos.filter(function (u) { return u.live === true; });
    if (!live.length) {
      var mintSpk = p2shSpk(editionRedeem(mintState, edTpl));
      return {
        index: ed.index, serial: String(ed.serial), covenantId: ed.covenantId,
        outpoint: { txId: ed.mintTxId, index: Number(ed.outputIndex != null ? ed.outputIndex : 1) },
        value: CARRIER, state: mintState, spk: mintSpk, source: 'mint', editionTemplate: edTpl
      };
    }
    if (live.length !== 1) throw new Error('edition has ' + live.length + ' live outputs');
    var liveOp = live[0].outpoint.split(':');
    var liveTx = liveOp[0], liveIdx = Number(liveOp[1]);
    var state, source;
    if (liveTx === ed.mintTxId && liveIdx === Number(ed.outputIndex != null ? ed.outputIndex : 1)) {
      state = mintState;
      source = 'mint';
    } else {
      var tx = await io.tx(liveTx);
      var inp0 = tx && tx.inputs && tx.inputs[0];
      if (!inp0) throw new Error('edition transition tx missing input 0');
      var sigHex = String(pick(inp0, ['signature_script', 'signatureScript']) || '').toLowerCase();
      var prev = inputOutpoint(inp0);
      var spent = prev ? utxos.filter(function (u) { return u.outpoint === prev.txId + ':' + prev.index && u.revealed_hex; })[0] : null;
      var pushes = sigHex ? parsePushes(sigHex) : [];
      var revealed = (spent && spent.revealed_hex) || (pushes.length ? pushes[pushes.length - 1] : '');
      if (!revealed) throw new Error('previous edition output has no revealed redeem script');
      var prevState = decodeEditionState(revealed, edTpl);
      if (sigHex) {
        state = applyEditionTransition(prevState, sigHex, edTpl);
      } else {
        state = prevState;
      }
      source = 'chain';
    }
    var expectSpk = p2shSpk(editionRedeem(state, edTpl));
    var liveSpk = stripVersion(String(live[0].script_hex || ''));
    if (liveSpk && liveSpk !== expectSpk) throw new Error('edition script does not match its decoded state (template drift)');
    return {
      index: ed.index, serial: String(ed.serial), covenantId: ed.covenantId,
      outpoint: { txId: liveTx, index: liveIdx },
      value: BigInt(live[0].value != null ? live[0].value : (kj.live_value != null ? kj.live_value : CARRIER)),
      state: state, spk: expectSpk, source: source, editionTemplate: edTpl
    };
  }

  /* ------------------------------------------------------------ multi-UTXO wallet input helper */
  function buildWalletInputs(funding, wallet) {
    var list = (funding && Array.isArray(funding.inputs) && funding.inputs.length) ? funding.inputs : [funding];
    return list.map(function (u) {
      return {
        txId: u.txId, index: Number(u.index), sequence: 0n, sigScript: '', computeBudget: P2PK_BUDGET,
        utxo: { amount: BigInt(u.amount), spk: p2pkSpk(wallet.pubkey), address: wallet.address, daa: BigInt(u.daa || 0), sign: true }
      };
    });
  }
  function walletSignIndices(draft) {
    var out = [];
    (draft.inputs || []).forEach(function (inp, idx) { if (inp.utxo && inp.utxo.sign) out.push(idx); });
    return out;
  }

  /* ------------------------------------------------------------ 1-click series deploy draft (Studio -> Kaspire) */
  function buildDeploySeries(p) {
    var st = p.state, funding = p.funding, artist = p.artist, edTpl = p.editionTemplate || tpl().edition;
    if (!/^[0-9a-f]{64}$/.test(artist.pubkey)) throw new Error('artist key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, artist.pubkey) !== artist.address) throw new Error('wallet public key does not belong to the connected address');
    var price = BigInt(st.price);
    if (price < SOMPI) throw new Error('series price must be at least 1 KAS');
    var roy = BigInt(st.royalty_bips);
    if (roy < MIN_ROYALTY_BIPS || roy > 2000n) throw new Error('royalty must be between 500 and 2000 bips (5% to 20%)');
    var supply = BigInt(st.mints_left);
    if (supply < 1n) throw new Error('series supply must be at least 1 edition');
    var nextSerial = BigInt(st.next_serial != null ? st.next_serial : 0);
    if (nextSerial < 0n || nextSerial >= (1n << 40n)) throw new Error('next_serial must be in [0, 2^40)');
    var prog = p.progBytes instanceof Uint8Array ? p.progBytes : hex2u8(p.progBytes);
    if (hashHex(prog) !== st.program_hash) throw new Error('program_hash does not match the assembled program bytes');
    var fee = BigInt(p.fee);
    var need = CARRIER + fee;
    if (BigInt(funding.amount) < need) throw new Error('funding output too small');
    var change = BigInt(funding.amount) - need;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var fullState = {
      program_hash: st.program_hash, artist: artist.pubkey, price: price,
      royalty_bips: roy, mints_left: supply, engine_lang: BigInt(st.engine_lang != null ? st.engine_lang : 2),
      render_hash: st.render_hash, next_serial: nextSerial
    };
    var redeemBytes = buildFactoryRedeem(fullState, prog, edTpl);
    var factorySpk = p2shSpk(redeemBytes);
    var laneCov = covenantIdGenesis(funding.txId, funding.index, [{ idx: 0, value: Number(CARRIER), script: factorySpk }]);
    var outputs = [
      { value: CARRIER, spk: factorySpk, covenant: { authorizingInput: 0, covenantId: laneCov }, role: 'lane' }
    ];
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(artist.pubkey), role: 'change' });
    return {
      version: 1, hrp: p.hrp,
      inputs: buildWalletInputs(funding, artist),
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'deploy', laneCovenantId: laneCov, factorySpk: factorySpk, redeemBytesLen: redeemBytes.length,
        carrier: CARRIER, fee: fee, change: change, price: price, royaltyBips: roy, supply: supply,
        artist: artist.pubkey, programHash: st.program_hash, renderHash: st.render_hash, state: fullState
      }
    };
  }

  /* ------------------------------------------------------------ mint draft */
  function buildMint(p) {
    var st = p.lane.state, funding = p.funding, buyer = p.buyer;
    var progBytes = p.progBytes || p.lane.progBytes || null;
    var edTpl = p.editionTemplate || p.lane.editionTemplate || tpl().edition;
    if (st.mints_left <= 0n) throw new Error('series is sold out');
    if (!/^[0-9a-f]{64}$/.test(buyer.pubkey)) throw new Error('buyer key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, buyer.pubkey) !== buyer.address) throw new Error('wallet public key does not belong to the connected address');
    var price = BigInt(st.price);
    if (price !== 0n && price < SOMPI) throw new Error('series price violates the 1 KAS floor');
    var fee = BigInt(p.fee);
    var need = price + CARRIER + fee;
    if (BigInt(funding.amount) < need) throw new Error('funding output too small');
    var change = BigInt(funding.amount) - need;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var curSerial = BigInt(st.next_serial != null ? st.next_serial : 0);
    var curState = Object.assign({}, st, { next_serial: curSerial });
    var curRedeem = factoryRedeem(curState, progBytes, edTpl);
    var curSpk = p2shSpk(curRedeem);
    if (curSpk !== p.lane.spk) throw new Error('lane spk drift');
    var next = { program_hash: st.program_hash, artist: st.artist, price: st.price, royalty_bips: st.royalty_bips, mints_left: st.mints_left - 1n, engine_lang: st.engine_lang, render_hash: st.render_hash, next_serial: curSerial + 1n };
    var nextSpk = p2shSpk(factoryRedeem(next, progBytes, edTpl));
    var serial = curSerial.toString();
    var edState = { ownerIdentifier: buyer.pubkey, identifierType: 0, price: 0, artist: st.artist, royalty_bips: st.royalty_bips, program_hash: st.program_hash, factory_covid: p.lane.covenantId, serial: serial, lineage: genesisLineage(p.lane.covenantId, curSerial), sales: 0 };
    var edSpk = p2shSpk(editionRedeem(edState, edTpl));
    var edCov = covenantIdGenesis(funding.txId, funding.index, [{ idx: 1, value: Number(CARRIER), script: edSpk }]);
    var outputs = [
      { value: p.lane.value, spk: nextSpk, covenant: { authorizingInput: 0, covenantId: p.lane.covenantId }, role: 'lane' },
      { value: CARRIER, spk: edSpk, covenant: { authorizingInput: 1, covenantId: edCov }, role: 'edition' }
    ];
    if (price > 0n) outputs.push({ value: price, spk: p2pkSpk(st.artist), role: 'artist' });
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(buyer.pubkey), role: 'change' });
    var tag = tpl().factory.entries.mint;
    var sigScript = cat([pushMin(hex2u8(buyer.pubkey)), pushMin(new Uint8Array([0])), pushMinInt(1), pushMinInt(2), pushMin(hex2u8(tag)),
      pushMin(curRedeem)]);
    var covInput = {
      txId: p.lane.outpoint.txId, index: p.lane.outpoint.index, sequence: 0n, sigScript: u8hex(sigScript), computeBudget: LANE_BUDGET,
      utxo: { amount: p.lane.value, spk: curSpk, address: p2shAddress(p.hrp, curSpk), daa: p.lane.daa || 0n, sign: false }
    };
    return {
      version: 1, hrp: p.hrp,
      inputs: [covInput].concat(buildWalletInputs(funding, buyer)),
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        serial: serial, editionCovenantId: edCov, price: price, carrier: CARRIER, fee: fee, change: change,
        royaltyBips: BigInt(st.royalty_bips), mintsLeftAfter: st.mints_left - 1n, artist: st.artist, buyer: buyer.pubkey
      }
    };
  }

  /* ------------------------------------------------------------ secondary market builders (buy, list, unlist, transfer, bid/sell) */
  function buildBuyEdition(p) {
    var ed = p.edition, st = ed.state, funding = p.funding, buyer = p.buyer;
    var edTpl = p.editionTemplate || ed.editionTemplate || tpl().edition;
    if (!/^[0-9a-f]{64}$/.test(buyer.pubkey)) throw new Error('buyer key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, buyer.pubkey) !== buyer.address) throw new Error('wallet public key does not belong to the connected address');
    var price = BigInt(st.price);
    if (price < SOMPI || price > MAX_PRICE) throw new Error('edition is not listed for sale (minimum 1 KAS)');
    var roy = (price * BigInt(st.royalty_bips)) / 10000n;
    if (roy < MIN_ROYALTY_OUT) throw new Error('royalty output (' + fmtKas(roy) + ' KAS) is below the 0.05 KAS mineability floor');
    var ownerNet = price - roy;
    var fee = BigInt(p.fee);
    var need = price + fee;
    if (BigInt(funding.amount) < need) throw new Error('funding output too small');
    var change = BigInt(funding.amount) - need;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var curRedeem = editionRedeem(st, edTpl);
    var curSpk = p2shSpk(curRedeem);
    if (ed.spk && curSpk !== ed.spk) throw new Error('edition spk drift');
    var nextState = {
      ownerIdentifier: buyer.pubkey, identifierType: 0, price: 0n,
      artist: st.artist, royalty_bips: BigInt(st.royalty_bips),
      program_hash: st.program_hash, factory_covid: st.factory_covid, serial: String(st.serial)
    };
    if (editionHasLineage(edTpl)) {
      nextState.lineage = advanceLineage(st.lineage, buyer.pubkey);
      nextState.sales = BigInt(st.sales || 0) + 1n;
    }
    var nextSpk = p2shSpk(editionRedeem(nextState, edTpl));
    var outputs = [
      { value: ed.value, spk: nextSpk, covenant: { authorizingInput: 0, covenantId: ed.covenantId }, role: 'edition' },
      { value: ownerNet, spk: p2pkSpk(st.ownerIdentifier), role: 'seller' },
      { value: roy, spk: p2pkSpk(st.artist), role: 'artist' }
    ];
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(buyer.pubkey), role: 'change' });
    var tag = (edTpl.entries && edTpl.entries.buy) || '1cd4096a';
    var sigScript = cat([pushMin(hex2u8(buyer.pubkey)), pushMinInt(1), pushMinInt(2), pushMin(hex2u8(tag)), pushMin(curRedeem)]);
    var covInput = {
      txId: ed.outpoint.txId, index: ed.outpoint.index, sequence: 0n, sigScript: u8hex(sigScript), computeBudget: LANE_BUDGET,
      utxo: { amount: ed.value, spk: curSpk, address: p2shAddress(p.hrp, curSpk), daa: ed.daa || 0n, sign: false }
    };
    return {
      version: 1, hrp: p.hrp,
      inputs: [covInput].concat(buildWalletInputs(funding, buyer)),
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'buy', serial: String(st.serial), editionCovenantId: ed.covenantId,
        price: price, ownerNet: ownerNet, royalty: roy, fee: fee, change: change,
        seller: st.ownerIdentifier, buyer: buyer.pubkey, artist: st.artist, nextState: nextState
      }
    };
  }

  // 2-party atomic Bid / Offer using ReliksEdition.sell (89cfc99a).
  // Works on ANY edition (listed or unlisted) at ANY offerPrice >= 1 KAS:
  // 1) Bidder signs their wallet input(s) [1..N] via Kaspire, creating a partially-signed PSKT bid.
  // 2) Edition owner co-signs input [0] via Kaspire, and finalizeOwnerCovenantTx wraps ownerSig into sell (89cfc99a).
  function buildMakeBid(p) {
    var ed = p.edition, st = ed.state, funding = p.funding, bidder = p.bidder;
    var edTpl = p.editionTemplate || ed.editionTemplate || tpl().edition;
    if (!/^[0-9a-f]{64}$/.test(bidder.pubkey)) throw new Error('bidder key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, bidder.pubkey) !== bidder.address) throw new Error('wallet public key does not belong to the connected address');
    var offerPrice = BigInt(p.offerPrice);
    if (offerPrice < SOMPI || offerPrice > MAX_PRICE) throw new Error('bid / offer must be at least 1 KAS');
    var roy = (offerPrice * BigInt(st.royalty_bips)) / 10000n;
    if (roy < MIN_ROYALTY_OUT) throw new Error('bid royalty (' + fmtKas(roy) + ' KAS) is below the 0.05 KAS mineability floor');
    var ownerNet = offerPrice - roy;
    var fee = BigInt(p.fee);
    var need = offerPrice + fee;
    if (BigInt(funding.amount) < need) throw new Error('funding output too small');
    var change = BigInt(funding.amount) - need;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var curRedeem = editionRedeem(st, edTpl);
    var curSpk = p2shSpk(curRedeem);
    if (ed.spk && curSpk !== ed.spk) throw new Error('edition spk drift');
    var nextState = {
      ownerIdentifier: bidder.pubkey, identifierType: 0, price: 0n,
      artist: st.artist, royalty_bips: BigInt(st.royalty_bips),
      program_hash: st.program_hash, factory_covid: st.factory_covid, serial: String(st.serial)
    };
    if (editionHasLineage(edTpl)) {
      nextState.lineage = advanceLineage(st.lineage, bidder.pubkey);
      nextState.sales = BigInt(st.sales || 0) + 1n;
    }
    var nextSpk = p2shSpk(editionRedeem(nextState, edTpl));
    var outputs = [
      { value: ed.value, spk: nextSpk, covenant: { authorizingInput: 0, covenantId: ed.covenantId }, role: 'edition' },
      { value: ownerNet, spk: p2pkSpk(st.ownerIdentifier), role: 'seller' },
      { value: roy, spk: p2pkSpk(st.artist), role: 'artist' }
    ];
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(bidder.pubkey), role: 'change' });
    var tag = (edTpl.entries && edTpl.entries.sell) || '89cfc99a';
    var sellerAddr = p2pkAddress(p.hrp, String(st.ownerIdentifier).toLowerCase());
    var covInput = {
      txId: ed.outpoint.txId, index: ed.outpoint.index, sequence: 0n, sigScript: '', computeBudget: LANE_BUDGET,
      ownerCovenant: { kind: 'sell', buyer: bidder.pubkey, salePrice: offerPrice, redeemHex: u8hex(curRedeem), tag: tag },
      // sign: false during the bidder's signing step; switched to sign: true when the edition owner accepts the bid
      utxo: { amount: ed.value, spk: curSpk, address: sellerAddr, daa: ed.daa || 0n, sign: false }
    };
    return {
      version: 1, hrp: p.hrp,
      inputs: [covInput].concat(buildWalletInputs(funding, bidder)),
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'bid', serial: String(st.serial), editionCovenantId: ed.covenantId,
        price: offerPrice, ownerNet: ownerNet, royalty: roy, fee: fee, change: change,
        seller: st.ownerIdentifier, buyer: bidder.pubkey, artist: st.artist, nextState: nextState
      }
    };
  }

  function buildOwnerEditionTx(p, mode) {
    var ed = p.edition, st = ed.state, funding = p.funding, owner = p.owner;
    var edTpl = p.editionTemplate || ed.editionTemplate || tpl().edition;
    if (!/^[0-9a-f]{64}$/.test(owner.pubkey)) throw new Error('owner key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, owner.pubkey) !== owner.address) throw new Error('wallet public key does not belong to the connected address');
    if (owner.pubkey !== String(st.ownerIdentifier).toLowerCase()) throw new Error('connected wallet does not own this edition');
    var fee = BigInt(p.fee);
    if (BigInt(funding.amount) < fee) throw new Error('funding output too small to cover network fee');
    var change = BigInt(funding.amount) - fee;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var curRedeem = editionRedeem(st, edTpl);
    var curSpk = p2shSpk(curRedeem);
    if (ed.spk && curSpk !== ed.spk) throw new Error('edition spk drift');
    var nextState = {
      ownerIdentifier: st.ownerIdentifier, identifierType: 0, price: BigInt(st.price),
      artist: st.artist, royalty_bips: BigInt(st.royalty_bips),
      program_hash: st.program_hash, factory_covid: st.factory_covid, serial: String(st.serial)
    };
    if (editionHasLineage(edTpl)) { nextState.lineage = st.lineage; nextState.sales = BigInt(st.sales || 0); }
    var covMeta = { kind: mode, redeemHex: u8hex(curRedeem) };
    if (mode === 'list') {
      var newPrice = BigInt(p.newPrice);
      if (newPrice < SOMPI || newPrice > MAX_PRICE) throw new Error('listing price must be at least 1 KAS');
      if ((newPrice * BigInt(st.royalty_bips)) / 10000n < MIN_ROYALTY_OUT) throw new Error('listing royalty is below the 0.05 KAS mineability floor');
      nextState.price = newPrice;
      covMeta.newPrice = newPrice;
      covMeta.tag = (edTpl.entries && edTpl.entries.list) || '674a8ea4';
    } else if (mode === 'unlist') {
      if (BigInt(st.price) <= 0n) throw new Error('edition is not currently listed');
      nextState.price = 0n;
      covMeta.tag = (edTpl.entries && edTpl.entries.unlist) || '88709f25';
    } else if (mode === 'transfer') {
      var rec = parseOwnerInput(p.hrp, p.newOwner);
      nextState.ownerIdentifier = rec.pubkey;
      nextState.price = 0n;
      if (editionHasLineage(edTpl)) nextState.lineage = advanceLineage(st.lineage, rec.pubkey);
      covMeta.newOwner = rec.pubkey;
      covMeta.newOwnerAddress = rec.address;
      covMeta.tag = (edTpl.entries && edTpl.entries.transfer) || '794dca54';
    } else {
      throw new Error('unknown owner edition action: ' + mode);
    }
    var nextSpk = p2shSpk(editionRedeem(nextState, edTpl));
    var outputs = [
      { value: ed.value, spk: nextSpk, covenant: { authorizingInput: 0, covenantId: ed.covenantId }, role: 'edition' }
    ];
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(owner.pubkey), role: 'change' });
    var covInput = {
      txId: ed.outpoint.txId, index: ed.outpoint.index, sequence: 0n, sigScript: '', computeBudget: LANE_BUDGET,
      ownerCovenant: covMeta,
      utxo: { amount: ed.value, spk: curSpk, address: owner.address, daa: ed.daa || 0n, sign: true }
    };
    return {
      version: 1, hrp: p.hrp,
      inputs: [covInput].concat(buildWalletInputs(funding, owner)),
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: mode, serial: String(st.serial), editionCovenantId: ed.covenantId,
        price: nextState.price, fee: fee, change: change, owner: owner.pubkey,
        newOwner: nextState.ownerIdentifier, nextState: nextState
      }
    };
  }
  function buildListEdition(p) { return buildOwnerEditionTx(p, 'list'); }
  function buildUnlistEdition(p) { return buildOwnerEditionTx(p, 'unlist'); }
  function buildTransferEdition(p) { return buildOwnerEditionTx(p, 'transfer'); }

  // After Kaspire signs inputs on a list/unlist/transfer/sell(accept-bid) draft, wrap input 0's 65-byte Schnorr signature
  // into the ReliksEdition covenant signatureScript. Since Kaspa sighash never hashes input signatureScripts,
  // both input 0's ownerSig and input 1..N's wallet signature(s) remain 100% valid.
  /* ------------------------------------------------------------ OfferEscrow builders (offer, accept, cancel, expire) */
  var ESCROW_FEE_BUFFER = 10000000n; // 0.1 KAS miner fee buffer locked in OfferEscrow so 2-input accept needs no extra wallet input

  function buildCreateEscrowOffer(p) {
    var ed = p.edition, st = ed.state, funding = p.funding, offerer = p.offerer;
    var escTpl = p.escrowTemplate || tpl().escrow;
    if (!escTpl) throw new Error('escrow template missing');
    if (!/^[0-9a-f]{64}$/.test(offerer.pubkey)) throw new Error('offerer key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, offerer.pubkey) !== offerer.address) throw new Error('wallet public key does not belong to the connected address');
    var askPrice = BigInt(p.askPrice != null ? p.askPrice : st.price);
    if (askPrice < SOMPI || askPrice > MAX_PRICE) throw new Error('escrow askPrice must be at least 1 KAS');
    if (BigInt(st.price) !== askPrice) throw new Error('edition must be listed at askPrice (' + fmtKas(askPrice) + ' KAS) before locking an OfferEscrow');
    var roy = (askPrice * BigInt(st.royalty_bips)) / 10000n;
    if (roy < MIN_ROYALTY_OUT) throw new Error('escrow royalty (' + fmtKas(roy) + ' KAS) is below the 0.05 KAS mineability floor');
    var expireAge = BigInt(p.expireAge != null ? p.expireAge : 100000);
    if (expireAge < 1n || expireAge >= (1n << 62n)) throw new Error('expireAge must be a positive DAA duration');
    var feeBuf = p.feeBuffer != null ? BigInt(p.feeBuffer) : ESCROW_FEE_BUFFER;
    var locked = askPrice + feeBuf;
    var fee = BigInt(p.fee);
    var need = locked + fee;
    if (BigInt(funding.amount) < need) throw new Error('funding output too small');
    var change = BigInt(funding.amount) - need;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var escState = {
      ownerIdentifier: String(st.ownerIdentifier).toLowerCase(),
      identifierType: 0,
      edition_covid: ed.covenantId,
      askPrice: askPrice,
      expireAge: expireAge,
      artist: String(st.artist).toLowerCase(),
      royalty_bips: BigInt(st.royalty_bips),
      offerer: offerer.pubkey
    };
    var escRedeemBytes = escrowRedeem(escState, escTpl);
    var escSpk = p2shSpk(escRedeemBytes);
    var outputs = [
      { value: locked, spk: escSpk, role: 'escrow' }
    ];
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(offerer.pubkey), role: 'change' });
    return {
      version: 1, hrp: p.hrp,
      inputs: buildWalletInputs(funding, offerer),
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'escrow_offer', serial: String(st.serial), editionCovenantId: ed.covenantId,
        askPrice: askPrice, locked: locked, feeBuffer: feeBuf, expireAge: expireAge,
        royalty: roy, ownerNet: askPrice - roy, fee: fee, change: change,
        escrowSpk: escSpk, escrowState: escState, offerer: offerer.pubkey, owner: st.ownerIdentifier
      }
    };
  }

  function buildAcceptEscrowOffer(p) {
    var ed = p.edition, st = ed.state, esc = p.escrow, owner = p.owner;
    var edTpl = p.editionTemplate || ed.editionTemplate || tpl().edition;
    var escTpl = p.escrowTemplate || tpl().escrow;
    if (!escTpl) throw new Error('escrow template missing');
    if (!/^[0-9a-f]{64}$/.test(owner.pubkey)) throw new Error('owner key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, owner.pubkey) !== owner.address) throw new Error('wallet public key does not belong to the connected address');
    var escSt = esc.state;
    if (owner.pubkey !== String(st.ownerIdentifier).toLowerCase()) throw new Error('connected wallet does not own this edition');
    if (owner.pubkey !== String(escSt.ownerIdentifier).toLowerCase()) throw new Error('escrow ownerIdentifier does not match edition owner');
    if (String(escSt.edition_covid).toLowerCase() !== String(ed.covenantId).toLowerCase()) throw new Error('escrow edition_covid does not match this edition');
    var askPrice = BigInt(escSt.askPrice);
    if (BigInt(st.price) !== askPrice) throw new Error('edition must be listed at exactly ' + fmtKas(askPrice) + ' KAS to accept this escrow');
    var locked = BigInt(esc.locked != null ? esc.locked : esc.value);
    if (locked < askPrice) throw new Error('escrow value is below askPrice');
    var roy = (askPrice * BigInt(escSt.royalty_bips)) / 10000n;
    if (roy < MIN_ROYALTY_OUT) throw new Error('escrow royalty is below the 0.05 KAS floor');
    var ownerNet = askPrice - roy;
    var fee = locked - askPrice;
    var curEdRedeem = editionRedeem(st, edTpl);
    var curEdSpk = p2shSpk(curEdRedeem);
    if (ed.spk && curEdSpk !== ed.spk) throw new Error('edition spk drift');
    var escRedeemBytes = escrowRedeem(escSt, escTpl);
    var escSpk = p2shSpk(escRedeemBytes);
    if (esc.spk && stripVersion(esc.spk) !== escSpk) throw new Error('escrow spk drift');
    var offererHex = String(escSt.offerer).toLowerCase();
    var nextEdState = {
      ownerIdentifier: offererHex, identifierType: 0, price: 0n,
      artist: st.artist, royalty_bips: BigInt(st.royalty_bips),
      program_hash: st.program_hash, factory_covid: st.factory_covid, serial: String(st.serial),
      lineage: advanceLineage(st.lineage, offererHex),
      sales: BigInt(st.sales || 0) + 1n
    };
    var nextEdSpk = p2shSpk(editionRedeem(nextEdState, edTpl));
    var buyTag = (edTpl.entries && edTpl.entries.buy) || '1cd4096a';
    var edSigScript = u8hex(cat([pushMin(hex2u8(offererHex)), pushMinInt(1), pushMinInt(2), pushMin(hex2u8(buyTag)), pushMin(curEdRedeem)]));
    var acceptTag = (escTpl.entries && escTpl.entries.accept) || '948f2512';
    var edInput = {
      txId: ed.outpoint.txId, index: Number(ed.outpoint.index), sequence: 0n, sigScript: edSigScript, computeBudget: LANE_BUDGET,
      utxo: { amount: ed.value, spk: curEdSpk, address: p2shAddress(p.hrp, curEdSpk), daa: ed.daa || 0n, sign: false }
    };
    var escTxId = esc.txId || (esc.outpoint && esc.outpoint.txId);
    var escIdx = Number(esc.index != null ? esc.index : (esc.outpoint && esc.outpoint.index) || 0);
    var escInput = {
      txId: escTxId, index: escIdx, sequence: 0n, sigScript: '', computeBudget: LANE_BUDGET,
      ownerCovenant: { kind: 'escrow_accept', redeemHex: u8hex(escRedeemBytes), tag: acceptTag },
      utxo: { amount: locked, spk: escSpk, address: owner.address, daa: BigInt(esc.daa || 0), sign: true }
    };
    var outputs = [
      { value: ed.value, spk: nextEdSpk, covenant: { authorizingInput: 0, covenantId: ed.covenantId }, role: 'edition' },
      { value: ownerNet, spk: p2pkSpk(owner.pubkey), role: 'seller' },
      { value: roy, spk: p2pkSpk(st.artist), role: 'artist' }
    ];
    return {
      version: 1, hrp: p.hrp,
      inputs: [edInput, escInput],
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'escrow_accept', serial: String(st.serial), editionCovenantId: ed.covenantId,
        price: askPrice, ownerNet: ownerNet, royalty: roy, fee: fee,
        seller: owner.pubkey, buyer: offererHex, artist: st.artist, nextState: nextEdState
      }
    };
  }

  function buildCancelEscrowOffer(p) {
    var esc = p.escrow, offerer = p.offerer, funding = p.funding;
    var escTpl = p.escrowTemplate || tpl().escrow;
    if (!escTpl) throw new Error('escrow template missing');
    if (!/^[0-9a-f]{64}$/.test(offerer.pubkey)) throw new Error('offerer key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, offerer.pubkey) !== offerer.address) throw new Error('wallet public key does not belong to the connected address');
    var escSt = esc.state;
    if (offerer.pubkey !== String(escSt.offerer).toLowerCase()) throw new Error('only the original offerer can cancel this escrow');
    var locked = BigInt(esc.locked != null ? esc.locked : esc.value);
    var fee = BigInt(p.fee);
    if (BigInt(funding.amount) < fee) throw new Error('funding output too small to cover network fee');
    var change = BigInt(funding.amount) - fee;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var escRedeemBytes = escrowRedeem(escSt, escTpl);
    var escSpk = p2shSpk(escRedeemBytes);
    if (esc.spk && stripVersion(esc.spk) !== escSpk) throw new Error('escrow spk drift');
    var cancelTag = (escTpl.entries && escTpl.entries.cancel) || 'a0893109';
    var escTxId = esc.txId || (esc.outpoint && esc.outpoint.txId);
    var escIdx = Number(esc.index != null ? esc.index : (esc.outpoint && esc.outpoint.index) || 0);
    var escInput = {
      txId: escTxId, index: escIdx, sequence: 0n, sigScript: '', computeBudget: LANE_BUDGET,
      ownerCovenant: { kind: 'escrow_cancel', redeemHex: u8hex(escRedeemBytes), tag: cancelTag },
      utxo: { amount: locked, spk: escSpk, address: offerer.address, daa: BigInt(esc.daa || 0), sign: true }
    };
    var outputs = [
      { value: locked, spk: p2pkSpk(offerer.pubkey), role: 'refund' }
    ];
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(offerer.pubkey), role: 'change' });
    return {
      version: 1, hrp: p.hrp,
      inputs: [escInput].concat(buildWalletInputs(funding, offerer)),
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'escrow_cancel', editionCovenantId: escSt.edition_covid,
        refund: locked, fee: fee, change: change, offerer: offerer.pubkey
      }
    };
  }

  function buildExpireEscrowOffer(p) {
    var esc = p.escrow, caller = p.caller, funding = p.funding;
    var escTpl = p.escrowTemplate || tpl().escrow;
    if (!escTpl) throw new Error('escrow template missing');
    if (!/^[0-9a-f]{64}$/.test(caller.pubkey)) throw new Error('caller key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, caller.pubkey) !== caller.address) throw new Error('wallet public key does not belong to the connected address');
    var wInputs = buildWalletInputs(funding, caller);
    if (wInputs.length !== 1) throw new Error('OfferEscrow.expire requires exactly 1 wallet funding UTXO (tx.inputs.length == 2)');
    var escSt = esc.state;
    var locked = BigInt(esc.locked != null ? esc.locked : esc.value);
    var fee = BigInt(p.fee);
    if (BigInt(funding.amount) < fee) throw new Error('funding output too small to cover network fee');
    var change = BigInt(funding.amount) - fee;
    if (change < MIN_CHANGE) { fee += change; change = 0n; }
    var escRedeemBytes = escrowRedeem(escSt, escTpl);
    var escSpk = p2shSpk(escRedeemBytes);
    if (esc.spk && stripVersion(esc.spk) !== escSpk) throw new Error('escrow spk drift');
    var expireTag = (escTpl.entries && escTpl.entries.expire) || '12ab1c61';
    var expireSigScript = u8hex(cat([pushMin(hex2u8(expireTag)), pushMin(escRedeemBytes)]));
    var seq = BigInt(escSt.expireAge);
    var escTxId = esc.txId || (esc.outpoint && esc.outpoint.txId);
    var escIdx = Number(esc.index != null ? esc.index : (esc.outpoint && esc.outpoint.index) || 0);
    var escInput = {
      txId: escTxId, index: escIdx, sequence: seq, sigScript: expireSigScript, computeBudget: LANE_BUDGET,
      utxo: { amount: locked, spk: escSpk, address: p2shAddress(p.hrp, escSpk), daa: BigInt(esc.daa || 0), sign: false }
    };
    var offererHex = String(escSt.offerer).toLowerCase();
    var outputs = [
      { value: locked, spk: p2pkSpk(offererHex), role: 'refund' }
    ];
    if (change > 0n) outputs.push({ value: change, spk: p2pkSpk(caller.pubkey), role: 'change' });
    return {
      version: 1, hrp: p.hrp,
      inputs: [escInput, wInputs[0]],
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'escrow_expire', editionCovenantId: escSt.edition_covid,
        refund: locked, expireAge: seq, fee: fee, change: change, offerer: offererHex
      }
    };
  }

  function finalizeOwnerCovenantTx(draft, signedJson) {
    var t = typeof signedJson === 'string' ? JSON.parse(signedJson) : JSON.parse(JSON.stringify(signedJson));
    var found = false;
    var updatedInputs = draft.inputs.map(function (inp, idx) {
      var meta = inp && inp.ownerCovenant;
      if (!meta) return inp;
      found = true;
      var rawSigScript = String((t.inputs && t.inputs[idx] && (t.inputs[idx].signatureScript || t.inputs[idx].signature_script)) || '').toLowerCase();
      if (!/^41[0-9a-f]{128}01$/.test(rawSigScript)) throw new Error('wallet did not return a standard Schnorr signature for covenant input ' + idx);
      var ownerSig65 = hex2u8(rawSigScript.slice(2));
      var curRedeem = hex2u8(meta.redeemHex);
      var tagBytes = hex2u8(meta.tag);
      var parts;
      if (meta.kind === 'list') parts = [pushMinInt(meta.newPrice), pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
      else if (meta.kind === 'unlist') parts = [pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
      else if (meta.kind === 'transfer') parts = [pushMin(hex2u8(meta.newOwner)), pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
      else if (meta.kind === 'sell') parts = [pushMin(hex2u8(meta.buyer)), pushMinInt(meta.salePrice), pushMinInt(1), pushMinInt(2), pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
      else if (meta.kind === 'escrow_accept') parts = [pushMin(ownerSig65), pushMinInt(0), pushMinInt(1), pushMinInt(2), pushMin(tagBytes), pushMin(curRedeem)];
      else if (meta.kind === 'escrow_cancel') parts = [pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
      else throw new Error('unknown owner covenant kind: ' + meta.kind);
      var fullSigHex = u8hex(cat(parts));
      t.inputs[idx].signatureScript = fullSigHex;
      if (t.inputs[idx].signature_script !== undefined) delete t.inputs[idx].signature_script;
      return Object.assign({}, inp, {
        sigScript: fullSigHex,
        utxo: Object.assign({}, inp.utxo, { sign: false })
      });
    });
    if (!found) throw new Error('draft is not an owner-authorized covenant transaction');
    var finalizedDraft = Object.assign({}, draft, { inputs: updatedInputs });
    var finalJson = JSON.stringify(t);
    var verified = verifySigned(finalizedDraft, finalJson);
    return { signedJson: finalJson, sigScripts: verified.sigScripts, rpcTx: verified.rpcTx, draft: finalizedDraft };
  }

  // Serialized size estimate (v1 tx) with room for the 66-byte Schnorr signature scripts and owner-covenant scripts.
  function estimateSize(draft) {
    var n = 2 + 8;                                              // version + input count
    draft.inputs.forEach(function (i) {
      var sl = i.sigScript ? i.sigScript.length / 2 : (i.ownerCovenant ? (i.ownerCovenant.redeemHex.length / 2) + 120 : (i.utxo.sign ? 66 : 0));
      n += 32 + 4 + 8 + sl + 8 + 2;                             // outpoint, script len, script, sequence, compute budget
    });
    n += 8;
    draft.outputs.forEach(function (o) { n += 8 + 2 + 8 + o.spk.length / 2 + (o.covenant ? 1 + 2 + 32 : 1); });
    return n + 8 + 20 + 8 + 8 + (draft.payload.length / 2);
  }
  function estimateFee(draft) {
    var raw = BigInt(estimateSize(draft)) * FEE_PER_BYTE;
    return raw + raw / 4n + 20000n;                              // +25% and a small floor; overpaying is harmless
  }

  /* ------------------------------------------------------------ wire formats */
  function withVersion(spk) { return '0000' + spk; }
  function toSafeJSON(draft) {
    return JSON.stringify({
      version: draft.version,
      inputs: draft.inputs.map(function (i) {
        return {
          previousOutpoint: { transactionId: i.txId, index: i.index },
          signatureScript: i.sigScript, sequence: i.sequence.toString(), sigOpCount: 0, computeBudget: i.computeBudget,
          utxo: {
            address: i.utxo.address, outpoint: { transactionId: i.txId, index: i.index }, amount: i.utxo.amount.toString(),
            scriptPublicKey: withVersion(i.utxo.spk), blockDaaScore: i.utxo.daa.toString(), isCoinbase: false
          }
        };
      }),
      outputs: draft.outputs.map(function (o) {
        var r = { value: o.value.toString(), scriptPublicKey: withVersion(o.spk) };
        if (o.covenant) r.covenant = { authorizingInput: o.covenant.authorizingInput, covenantId: o.covenant.covenantId };
        return r;
      }),
      lockTime: draft.lockTime.toString(), subnetworkId: '00'.repeat(20), gas: draft.gas.toString(), payload: draft.payload
    });
  }
  function toRpcTx(draft, sigScripts) {
    return {
      version: draft.version,
      inputs: draft.inputs.map(function (i, k) {
        return { previousOutpoint: { transactionId: i.txId, index: i.index }, signatureScript: sigScripts ? sigScripts[k] : i.sigScript, sequence: Number(i.sequence), sigOpCount: 0, computeBudget: i.computeBudget };
      }),
      outputs: draft.outputs.map(function (o) {
        var r = { value: Number(o.value), scriptPublicKey: withVersion(o.spk) };
        if (o.covenant) r.covenant = { authorizingInput: o.covenant.authorizingInput, covenantId: o.covenant.covenantId };
        return r;
      }),
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: ''
    };
  }

  /* ------------------------------------------------------------ post-signature verification */
  function verifySigned(draft, signedJson) {
    var t = typeof signedJson === 'string' ? JSON.parse(signedJson) : signedJson;
    function fail(m) { throw new Error('wallet returned a different transaction: ' + m); }
    if (!t || !Array.isArray(t.inputs) || !Array.isArray(t.outputs)) fail('malformed');
    if (Number(t.version) !== draft.version) fail('version');
    if (t.inputs.length !== draft.inputs.length) fail('input count');
    if (t.outputs.length !== draft.outputs.length) fail('output count');
    var sigs = [];
    draft.inputs.forEach(function (want, k) {
      var got = t.inputs[k], op = got.previousOutpoint || {};
      if ((op.transactionId || op.transaction_id) !== want.txId || Number(op.index) !== want.index) fail('input ' + k + ' outpoint');
      var ss = String(got.signatureScript || got.signature_script || '').toLowerCase();
      if (!want.utxo.sign) { if (ss !== want.sigScript) fail('factory input script was altered'); }
      else if (!/^41[0-9a-f]{128}01$/.test(ss)) fail('input ' + k + ' has no standard Schnorr signature');
      sigs.push(ss);
    });
    draft.outputs.forEach(function (want, k) {
      var got = t.outputs[k];
      var v = BigInt(pick(got, ['value', 'amount']));
      if (v !== want.value) fail('output ' + k + ' value');
      var spk = pick(got, ['scriptPublicKey', 'script_public_key']);
      if (spk && typeof spk === 'object') spk = pick(spk, ['scriptPublicKey', 'script_public_key']);
      if (stripVersion(String(spk)) !== want.spk) fail('output ' + k + ' script');
      var cov = got.covenant;
      if (!!cov !== !!want.covenant) fail('output ' + k + ' covenant binding');
      if (cov) {
        var id = pick(cov, ['covenantId', 'covenant_id']), ai = pick(cov, ['authorizingInput', 'authorizing_input']);
        if (id !== want.covenant.covenantId || Number(ai) !== want.covenant.authorizingInput) fail('output ' + k + ' covenant');
      }
    });
    return { sigScripts: sigs, rpcTx: toRpcTx(draft, sigs) };
  }

  /* ------------------------------------------------------------ wallet funding selection (single + automatic multi-UTXO) */
  function utxoEntry(x) { return x.utxoEntry || x; }
  function toUtxoObj(x) {
    var e = utxoEntry(x), op = x.outpoint || e.outpoint;
    return {
      txId: pick(op, ['transactionId', 'transaction_id']),
      index: Number(op.index),
      amount: BigInt(e.amount),
      daa: BigInt(pick(e, ['blockDaaScore', 'block_daa_score']))
    };
  }
  // Prefers a single confirmed output when large enough (minimum mass); automatically combines up to maxInputs (default 4)
  // confirmed outputs when the wallet is fragmented, eliminating "compound your UTXOs first" errors.
  function pickFunding(list, needAtLeast, maxInputs) {
    var cap = maxInputs == null ? 4 : Number(maxInputs);
    var conf = (list || []).filter(function (x) { var e = utxoEntry(x); return pick(e, ['blockDaaScore', 'block_daa_score']) != null && !pick(e, ['isCoinbase', 'is_coinbase']); });
    conf.sort(function (a, b) { var d = BigInt(utxoEntry(b).amount) - BigInt(utxoEntry(a).amount); return d > 0n ? 1 : d < 0n ? -1 : 0; });
    if (!conf.length) return { error: 'no confirmed, spendable output in this wallet' };
    var first = toUtxoObj(conf[0]);
    if (first.amount >= needAtLeast) {
      first.inputs = [ { txId: first.txId, index: first.index, amount: first.amount, daa: first.daa } ];
      return first;
    }
    var chosen = [], sum = 0n;
    for (var i = 0; i < conf.length && i < cap; i++) {
      var u = toUtxoObj(conf[i]);
      chosen.push(u);
      sum += u.amount;
      if (sum >= needAtLeast) {
        return { txId: chosen[0].txId, index: chosen[0].index, amount: sum, daa: chosen[0].daa, inputs: chosen };
      }
    }
    return { error: 'top ' + chosen.length + ' wallet outputs hold ' + fmtKas(sum) + ' KAS total; this transaction needs at least ' + fmtKas(needAtLeast) + ' KAS', largest: first.amount, total: sum };
  }

  function fmtKas(sompi) {
    var v = BigInt(sompi), neg = v < 0n; if (neg) v = -v;
    var whole = v / SOMPI, frac = (v % SOMPI).toString().padStart(8, '0').replace(/0+$/, '');
    return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
  }

  var api = {
    SOMPI: SOMPI, CARRIER: CARRIER, MAX_PRICE: MAX_PRICE, MIN_ROYALTY_OUT: MIN_ROYALTY_OUT, MIN_ROYALTY_BIPS: MIN_ROYALTY_BIPS, init: init,
    hex2u8: hex2u8, u8hex: u8hex, utf8: utf8, hash: hash, hashHex: hashHex,
    pushExp: pushExp, pushMin: pushMin, pushMinInt: pushMinInt, parseScriptInt: parseScriptInt,
    encFactoryState: encFactoryState, encEditionState: encEditionState, encEscrowState: encEscrowState,
    buildFactorySuffix: buildFactorySuffix, buildFactoryRedeem: buildFactoryRedeem,
    factoryRedeem: factoryRedeem, editionRedeem: editionRedeem, escrowRedeem: escrowRedeem,
    p2shSpk: p2shSpk, p2pkSpk: p2pkSpk,
    p2pkAddress: p2pkAddress, p2shAddress: p2shAddress, decodeAddress: decodeAddress, parseOwnerInput: parseOwnerInput,
    covenantIdGenesis: covenantIdGenesis,
    genesisLineage: genesisLineage, genesisLineageCounter: genesisLineageCounter, advanceLineage: advanceLineage, editionHasLineage: editionHasLineage,
    decodeFactoryState: decodeFactoryState, decodeEditionState: decodeEditionState, decodeEscrowState: decodeEscrowState, parsePushes: parsePushes,
    spkOfOutput: spkOfOutput, outputValue: outputValue, inputOutpoint: inputOutpoint, covenantOf: covenantOf,
    makeIO: makeIO, resolveLane: resolveLane, resolveEdition: resolveEdition,
    buildDeploySeries: buildDeploySeries, buildMint: buildMint,
    buildBuyEdition: buildBuyEdition, buildMakeBid: buildMakeBid,
    buildListEdition: buildListEdition, buildUnlistEdition: buildUnlistEdition, buildTransferEdition: buildTransferEdition,
    buildCreateEscrowOffer: buildCreateEscrowOffer, buildAcceptEscrowOffer: buildAcceptEscrowOffer, buildCancelEscrowOffer: buildCancelEscrowOffer, buildExpireEscrowOffer: buildExpireEscrowOffer, ESCROW_FEE_BUFFER: ESCROW_FEE_BUFFER,
    finalizeOwnerCovenantTx: finalizeOwnerCovenantTx, walletSignIndices: walletSignIndices,
    estimateSize: estimateSize, estimateFee: estimateFee,
    toSafeJSON: toSafeJSON, toRpcTx: toRpcTx, verifySigned: verifySigned, pickFunding: pickFunding, fmtKas: fmtKas,
    pick: pick, stripVersion: stripVersion
  };
  return api;
});
