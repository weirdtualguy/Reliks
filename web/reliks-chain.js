/* Reliks chain library: everything the browser (and the tests) need to read
   Reliks state from Kaspa and to build series deployment, mint, and secondary
   market (list, unlist, buy, transfer) transactions.

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
  // Field order and widths are frozen with the v12/v13 contracts (spans 135 / 161 / 203).
  var ED = [['ownerIdentifier', 32], ['identifierType', 1], ['price', 8], ['artist', 32], ['royalty_bips', 8], ['program_hash', 32], ['factory_covid', 32], ['serial', 8]];
  var ED13 = ED.concat([['lineage', 32], ['sales', 8]]);
  function edTable(edTpl) {
    var f = (edTpl && edTpl.fields) || (TPL && TPL.edition && TPL.edition.fields);
    return (f && f.indexOf('lineage') >= 0) ? ED13 : ED;
  }
  function editionHasLineage(edTpl) { return edTable(edTpl) === ED13; }
  var FC = [['program_hash', 32], ['artist', 32], ['price', 8], ['royalty_bips', 8], ['mints_left', 8], ['engine_lang', 8], ['render_hash', 32]];
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
  function encFactoryState(s) { return encFields(FC, s); }
  function encEditionState(s, edTpl) { return encFields(edTable(edTpl), s); }

  var TPL = null;
  function init(templates) {
    if (!templates || !templates.factory || !templates.edition) throw new Error('templates missing');
    TPL = templates;
    return api;
  }
  function tpl() { if (!TPL) throw new Error('ReliksChain.init(templates) not called'); return TPL; }
  function redeem(t, encoded) { return cat([hex2u8(t.prefixHex), encoded, hex2u8(t.suffixHex)]); }

  // Synthesize the exact SeriesFactory-v12 or SeriesFactory-v13 suffix for any program/engine bytes (<= 25641 B)
  // without needing silverc in the browser. For the v12 mainnet engine + v12 edition template, this reproduces
  // tpl().factory.suffixHex byte-for-byte.
  function buildFactorySuffix(progBytes, edTemplate) {
    var baseSuf = hex2u8(tpl().factory.suffixHex);
    var edTpl = edTemplate || tpl().edition;
    var isV13 = editionHasLineage(edTpl);
    var prog = progBytes instanceof Uint8Array ? progBytes : hex2u8(progBytes);
    if (prog.length < 1 || prog.length > 25641) throw new Error('program length must be 1..25641 bytes');
    var pushProg = pushMin(prog);
    var edSuf = hex2u8(edTpl.suffixHex);
    var pushEd = pushMin(edSuf);
    var pushTh = pushMin(hex2u8(edTpl.templateHashHex));
    var p0 = baseSuf.subarray(0, 74);
    var p1 = baseSuf.subarray(3965, 4007);
    var p2 = baseSuf.subarray(7898, 8124);
    var v13Lin = isV13 ? hex2u8('0f52656c696b7347656e657369735632b9ba7eb9bb54cd7eaa00') : new Uint8Array(0);
    var p4 = baseSuf.subarray(8157, 8169);
    var p5 = baseSuf.subarray(10174, 10181);
    var p6 = baseSuf.subarray(12186, 12190);
    var p7 = isV13
      ? hex2u8('01205a797e01015a797e01085a7958cd7e01205a797e01085a7958cd7e01205a797e01205a797e01085a7958cd7e01205a797e01085a7958cd7e7e7e7e7e7e7e7e7e7e')
      : baseSuf.subarray(12190, 12243);
    var p8 = baseSuf.subarray(12243, 12247);
    var p9 = baseSuf.subarray(14252, 14268);
    var p10 = isV13
      ? hex2u8('011779c388011679c20400e1f505a269b9cb519c69b900cc76c2b9bea2690115790115790115790115790115795194011579011579')
      : baseSuf.subarray(14268, 14324);
    var tailHex = u8hex(baseSuf.subarray(14324));
    if (isV13) {
      tailHex = tailHex.replace('75'.repeat(31) + '5167760499ec7fba', '75'.repeat(33) + '5167760499ec7fba');
    }
    var headLen = p0.length + pushProg.length + p1.length + pushProg.length + p2.length + v13Lin.length + pushTh.length + p4.length + pushEd.length + p5.length + pushEd.length + p6.length + p7.length + p8.length + pushEd.length + p9.length + p10.length;
    var patchedTail = hex2u8(tailHex);
    var oldPat = 'b976c902a53c94765193bc7c7eb976c976021dbc937cbc';
    for (var iter = 0; iter < 3; iter++) {
      var sufLen = headLen + patchedTail.length;
      var totLen = 136 + sufLen;
      var newPat = 'b976c9' + u8hex(pushMinInt(totLen)) + '94765193bc7c7eb976c976' + u8hex(pushMinInt(-sufLen)) + '937cbc';
      patchedTail = hex2u8(tailHex.split(oldPat).join(newPat));
    }
    return cat([p0, pushProg, p1, pushProg, p2, v13Lin, pushTh, p4, pushEd, p5, pushEd, p6, p7, p8, pushEd, p9, p10, patchedTail]);
  }
  function buildFactoryRedeem(state, progBytes, edTemplate) {
    if (!progBytes) return redeem(tpl().factory, encFactoryState(state));
    return cat([hex2u8(tpl().factory.prefixHex), encFactoryState(state), buildFactorySuffix(progBytes, edTemplate)]);
  }
  function factoryRedeem(s, progBytes, edTemplate) { return buildFactoryRedeem(s, progBytes, edTemplate); }
  function editionRedeem(s, edTemplate) { return redeem(edTemplate || tpl().edition, encEditionState(s, edTemplate)); }
  function p2shSpk(redeemBytes) { return 'aa20' + u8hex(hash(redeemBytes)) + '87'; }
  function p2pkSpk(pubkeyHex) { return '20' + pubkeyHex + 'ac'; }

  /* ------------------------------------------------------------ serial and covenant id */
  // ReliksSerialV10: 63-bit LE polynomial of blake2b(domain || txid || le32(index)).
  function serialFromOutpoint(txId, index) {
    var h = hash(cat([utf8('ReliksSerialV10'), hex2u8(txId), le32(index)]));
    var s = 0n;
    for (var i = 0; i < 7; i++) s += BigInt(h[i]) * (256n ** BigInt(i));
    return (s + BigInt(h[7] % 128) * 72057594037927936n).toString();
  }
  // v13 provenance chain: genesis = blake2b('ReliksGenesisV2' || lane txid || le32(lane index)); each ownership change = blake2b('ReliksLineageV2' || prev || newOwner).
  function genesisLineage(txId, index) { return u8hex(hash(cat([utf8('ReliksGenesisV2'), hex2u8(txId), le32(index)]))); }
  function advanceLineage(prevHex, ownerHex) { return u8hex(hash(cat([utf8('ReliksLineageV2'), hex2u8(prevHex), hex2u8(ownerHex)]))); }
  // KIP-20 genesis covenant id: keyed blake2b("CovenantID") over the authorizing outpoint and the bound outputs.
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
    if (pushes.length !== 7) throw new Error('factory state has ' + pushes.length + ' fields, expected 7');
    return { program_hash: pushes[0], artist: pushes[1], price: u64le(pushes[2]), royalty_bips: u64le(pushes[3]), mints_left: u64le(pushes[4]), engine_lang: u64le(pushes[5]), render_hash: pushes[6] };
  }
  function decodeEditionState(revealedHex, edTpl) {
    var et = edTpl || tpl().edition;
    var span = et.span;
    var p = parsePushes(revealedHex.slice(span.offset * 2, (span.offset + span.len) * 2));
    var want = edTable(et).length;
    if (p.length !== want) throw new Error('edition state has ' + p.length + ' fields, expected ' + want);
    var st = { ownerIdentifier: p[0], identifierType: Number(u64le(p[1])), price: u64le(p[2]), artist: p[3], royalty_bips: u64le(p[4]), program_hash: p[5], factory_covid: p[6], serial: u64le(p[7]).toString() };
    if (want === 10) { st.lineage = p[8]; st.sales = u64le(p[9]); }
    return st;
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
      state = { program_hash: g.program_hash, artist: g.artist, price: BigInt(g.price), royalty_bips: BigInt(g.royalty_bips), mints_left: BigInt(g.mints_left), engine_lang: BigInt(g.engine_lang || 0), render_hash: g.render_hash };
      source = 'registry';
    } else {
      var mintTx = await io.tx(laneTx);
      var prev = inputOutpoint(mintTx.inputs[0]);
      var spent = utxos.filter(function (u) { return u.outpoint === prev.txId + ':' + prev.index && u.revealed_hex; })[0];
      if (!spent) throw new Error('previous lane output has no revealed script in kascov');
      var st = decodeFactoryState(spent.revealed_hex);
      state = { program_hash: st.program_hash, artist: st.artist, price: st.price, royalty_bips: st.royalty_bips, mints_left: st.mints_left - 1n, engine_lang: st.engine_lang, render_hash: st.render_hash };
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
    if (hasLin) {
      var consumed = ed.index === 0 ? series.genesisTxId : (series.editions[ed.index - 1] && series.editions[ed.index - 1].mintTxId) || series.genesisTxId;
      mintState.lineage = ed.lineage || genesisLineage(consumed, 0);
      mintState.sales = BigInt(ed.sales || 0);
    }
    var kj = null;
    try { kj = await io.covenant(ed.covenantId); } catch (e) { kj = null; }
    var utxos = (kj && kj.utxos) || [];
    var live = utxos.filter(function (u) { return u.live === true; });
    if (!live.length) {
      // Fallback to mint output if kascov has not indexed secondary events or is unreachable
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

  /* ------------------------------------------------------------ 1-click series deploy draft (Studio -> Kaspire) */
  function buildDeploySeries(p) {
    var st = p.state, funding = p.funding, artist = p.artist, edTpl = p.editionTemplate || tpl().edition;
    if (!/^[0-9a-f]{64}$/.test(artist.pubkey)) throw new Error('artist key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, artist.pubkey) !== artist.address) throw new Error('wallet public key does not belong to the connected address');
    var price = BigInt(st.price);
    if (price !== 0n && price < SOMPI) throw new Error('series price must be 0 or at least 1 KAS');
    var roy = BigInt(st.royalty_bips);
    if (roy < 1n || roy > 2000n) throw new Error('royalty must be between 1 and 2000 bips (0.01% to 20%)');
    var supply = BigInt(st.mints_left);
    if (supply < 1n) throw new Error('series supply must be at least 1 edition');
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
      render_hash: st.render_hash
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
      inputs: [
        { txId: funding.txId, index: funding.index, sequence: 0n, sigScript: '', computeBudget: P2PK_BUDGET,
          utxo: { amount: BigInt(funding.amount), spk: p2pkSpk(artist.pubkey), address: artist.address, daa: BigInt(funding.daa || 0), sign: true } }
      ],
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
    var curRedeem = factoryRedeem(st, progBytes, edTpl);
    var curSpk = p2shSpk(curRedeem);
    if (curSpk !== p.lane.spk) throw new Error('lane spk drift');
    var next = { program_hash: st.program_hash, artist: st.artist, price: st.price, royalty_bips: st.royalty_bips, mints_left: st.mints_left - 1n, engine_lang: st.engine_lang, render_hash: st.render_hash };
    var nextSpk = p2shSpk(factoryRedeem(next, progBytes, edTpl));
    var serial = serialFromOutpoint(p.lane.outpoint.txId, p.lane.outpoint.index);
    var edState = { ownerIdentifier: buyer.pubkey, identifierType: 0, price: 0, artist: st.artist, royalty_bips: st.royalty_bips, program_hash: st.program_hash, factory_covid: p.lane.covenantId, serial: serial };
    if (editionHasLineage(edTpl)) { edState.lineage = genesisLineage(p.lane.outpoint.txId, p.lane.outpoint.index); edState.sales = 0; }
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
    return {
      version: 1, hrp: p.hrp,
      inputs: [
        { txId: p.lane.outpoint.txId, index: p.lane.outpoint.index, sequence: 0n, sigScript: u8hex(sigScript), computeBudget: LANE_BUDGET,
          utxo: { amount: p.lane.value, spk: curSpk, address: p2shAddress(p.hrp, curSpk), daa: p.lane.daa || 0n, sign: false } },
        { txId: funding.txId, index: funding.index, sequence: 0n, sigScript: '', computeBudget: P2PK_BUDGET,
          utxo: { amount: BigInt(funding.amount), spk: p2pkSpk(buyer.pubkey), address: buyer.address, daa: BigInt(funding.daa || 0), sign: true } }
      ],
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        serial: serial, editionCovenantId: edCov, price: price, carrier: CARRIER, fee: fee, change: change,
        royaltyBips: BigInt(st.royalty_bips), mintsLeftAfter: st.mints_left - 1n, artist: st.artist, buyer: buyer.pubkey
      }
    };
  }

  /* ------------------------------------------------------------ secondary market builders (buy, list, unlist, transfer) */
  function buildBuyEdition(p) {
    var ed = p.edition, st = ed.state, funding = p.funding, buyer = p.buyer;
    var edTpl = p.editionTemplate || ed.editionTemplate || tpl().edition;
    if (!/^[0-9a-f]{64}$/.test(buyer.pubkey)) throw new Error('buyer key must be 32 bytes of lowercase hex');
    if (p2pkAddress(p.hrp, buyer.pubkey) !== buyer.address) throw new Error('wallet public key does not belong to the connected address');
    var price = BigInt(st.price);
    if (price < SOMPI || price > MAX_PRICE) throw new Error('edition is not listed for sale (minimum 1 KAS)');
    var roy = (price * BigInt(st.royalty_bips)) / 10000n;
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
    return {
      version: 1, hrp: p.hrp,
      inputs: [
        { txId: ed.outpoint.txId, index: ed.outpoint.index, sequence: 0n, sigScript: u8hex(sigScript), computeBudget: LANE_BUDGET,
          utxo: { amount: ed.value, spk: curSpk, address: p2shAddress(p.hrp, curSpk), daa: ed.daa || 0n, sign: false } },
        { txId: funding.txId, index: funding.index, sequence: 0n, sigScript: '', computeBudget: P2PK_BUDGET,
          utxo: { amount: BigInt(funding.amount), spk: p2pkSpk(buyer.pubkey), address: buyer.address, daa: BigInt(funding.daa || 0), sign: true } }
      ],
      outputs: outputs, lockTime: 0n, gas: 0n, payload: '', fee: fee,
      summary: {
        kind: 'buy', serial: String(st.serial), editionCovenantId: ed.covenantId,
        price: price, ownerNet: ownerNet, royalty: roy, fee: fee, change: change,
        seller: st.ownerIdentifier, buyer: buyer.pubkey, artist: st.artist, nextState: nextState
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
    return {
      version: 1, hrp: p.hrp,
      inputs: [
        { txId: ed.outpoint.txId, index: ed.outpoint.index, sequence: 0n, sigScript: '', computeBudget: LANE_BUDGET,
          ownerCovenant: covMeta,
          // Passing owner.address in SafeJSON allows Kaspire to sign input 0 with the owner's Schnorr key over input 0's exact sighash (which commits to curSpk and ed.value).
          utxo: { amount: ed.value, spk: curSpk, address: owner.address, daa: ed.daa || 0n, sign: true } },
        { txId: funding.txId, index: funding.index, sequence: 0n, sigScript: '', computeBudget: P2PK_BUDGET,
          utxo: { amount: BigInt(funding.amount), spk: p2pkSpk(owner.pubkey), address: owner.address, daa: BigInt(funding.daa || 0), sign: true } }
      ],
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

  // After Kaspire signs inputs [0, 1] on a list/unlist/transfer draft, wrap input 0's 65-byte Schnorr signature
  // into the ReliksEdition covenant signatureScript. Since Kaspa sighash never hashes input signatureScripts,
  // both input 0's ownerSig and input 1's wallet signature remain 100% valid.
  function finalizeOwnerCovenantTx(draft, signedJson) {
    var t = typeof signedJson === 'string' ? JSON.parse(signedJson) : JSON.parse(JSON.stringify(signedJson));
    var inp0 = draft.inputs[0], meta = inp0 && inp0.ownerCovenant;
    if (!meta) throw new Error('draft is not an owner-authorized covenant transaction');
    var rawSigScript = String((t.inputs && t.inputs[0] && (t.inputs[0].signatureScript || t.inputs[0].signature_script)) || '').toLowerCase();
    if (!/^41[0-9a-f]{128}01$/.test(rawSigScript)) throw new Error('wallet did not return a standard Schnorr signature for edition input 0');
    var ownerSig65 = hex2u8(rawSigScript.slice(2));
    var curRedeem = hex2u8(meta.redeemHex);
    var tagBytes = hex2u8(meta.tag);
    var parts;
    if (meta.kind === 'list') parts = [pushMinInt(meta.newPrice), pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
    else if (meta.kind === 'unlist') parts = [pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
    else if (meta.kind === 'transfer') parts = [pushMin(hex2u8(meta.newOwner)), pushMin(ownerSig65), pushMin(tagBytes), pushMin(curRedeem)];
    else throw new Error('unknown owner covenant kind: ' + meta.kind);
    var fullSigHex = u8hex(cat(parts));
    t.inputs[0].signatureScript = fullSigHex;
    if (t.inputs[0].signature_script !== undefined) delete t.inputs[0].signature_script;
    var finalizedDraft = Object.assign({}, draft, {
      inputs: draft.inputs.map(function (inp, idx) {
        if (idx !== 0) return inp;
        return Object.assign({}, inp, {
          sigScript: fullSigHex,
          utxo: Object.assign({}, inp.utxo, { sign: false })
        });
      })
    });
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

  /* ------------------------------------------------------------ wallet funding selection */
  function utxoEntry(x) { return x.utxoEntry || x; }
  function pickFunding(list, needAtLeast) {
    var conf = (list || []).filter(function (x) { var e = utxoEntry(x); return pick(e, ['blockDaaScore', 'block_daa_score']) != null && !pick(e, ['isCoinbase', 'is_coinbase']); });
    conf.sort(function (a, b) { var d = BigInt(utxoEntry(b).amount) - BigInt(utxoEntry(a).amount); return d > 0n ? 1 : d < 0n ? -1 : 0; });
    var best = conf[0];
    if (!best) return { error: 'no confirmed, spendable output in this wallet' };
    var amt = BigInt(utxoEntry(best).amount);
    if (amt < needAtLeast) return { error: 'largest output holds ' + fmtKas(amt) + ' KAS; this transaction needs a single output of at least ' + fmtKas(needAtLeast) + ' KAS (compound your UTXOs in Kaspire first)', largest: amt };
    var op = best.outpoint || utxoEntry(best).outpoint;
    return { txId: pick(op, ['transactionId', 'transaction_id']), index: Number(op.index), amount: amt, daa: BigInt(pick(utxoEntry(best), ['blockDaaScore', 'block_daa_score'])) };
  }

  function fmtKas(sompi) {
    var v = BigInt(sompi), neg = v < 0n; if (neg) v = -v;
    var whole = v / SOMPI, frac = (v % SOMPI).toString().padStart(8, '0').replace(/0+$/, '');
    return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
  }

  var api = {
    SOMPI: SOMPI, CARRIER: CARRIER, MAX_PRICE: MAX_PRICE, init: init,
    hex2u8: hex2u8, u8hex: u8hex, utf8: utf8, hash: hash, hashHex: hashHex,
    pushExp: pushExp, pushMin: pushMin, pushMinInt: pushMinInt, parseScriptInt: parseScriptInt,
    encFactoryState: encFactoryState, encEditionState: encEditionState,
    buildFactorySuffix: buildFactorySuffix, buildFactoryRedeem: buildFactoryRedeem,
    factoryRedeem: factoryRedeem, editionRedeem: editionRedeem,
    p2shSpk: p2shSpk, p2pkSpk: p2pkSpk,
    p2pkAddress: p2pkAddress, p2shAddress: p2shAddress, decodeAddress: decodeAddress, parseOwnerInput: parseOwnerInput,
    serialFromOutpoint: serialFromOutpoint, covenantIdGenesis: covenantIdGenesis,
    genesisLineage: genesisLineage, advanceLineage: advanceLineage, editionHasLineage: editionHasLineage,
    decodeFactoryState: decodeFactoryState, decodeEditionState: decodeEditionState, parsePushes: parsePushes,
    spkOfOutput: spkOfOutput, outputValue: outputValue, inputOutpoint: inputOutpoint, covenantOf: covenantOf,
    makeIO: makeIO, resolveLane: resolveLane, resolveEdition: resolveEdition,
    buildDeploySeries: buildDeploySeries, buildMint: buildMint,
    buildBuyEdition: buildBuyEdition, buildListEdition: buildListEdition, buildUnlistEdition: buildUnlistEdition, buildTransferEdition: buildTransferEdition,
    finalizeOwnerCovenantTx: finalizeOwnerCovenantTx,
    estimateSize: estimateSize, estimateFee: estimateFee,
    toSafeJSON: toSafeJSON, toRpcTx: toRpcTx, verifySigned: verifySigned, pickFunding: pickFunding, fmtKas: fmtKas,
    pick: pick, stripVersion: stripVersion
  };
  return api;
});
