/* Reliks v10 generative gallery runtime. Browser globals: RB2B, REG, fetch, document.
   Pure functions are exported so gen-gallery-v10.js can parity-test them in Node. */
(function (root) {
  'use strict';
  function hexToBytes(h) { var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
  function bytesToHex(b) { var s = ''; for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2); return s; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function concat(arrs) { var n = 0, i; for (i = 0; i < arrs.length; i++) n += arrs[i].length; var out = new Uint8Array(n), o = 0; for (i = 0; i < arrs.length; i++) { out.set(arrs[i], o); o += arrs[i].length; } return out; }
  function le32(n) { var b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, Number(n), true); return b; }
  function le64(v) { var b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; }
  function blake(bytes, len) { return RB2B(bytes, len || 32); }
  function blakeHex(bytes, len) { return bytesToHex(blake(bytes, len)); }

  /* ---- KCC1 PushExplicit state framing ---- */
  function pushFramed(b) {
    var head;
    if (b.length < 0x4c) head = Uint8Array.of(b.length);
    else if (b.length <= 0xff) head = Uint8Array.of(0x4c, b.length);
    else head = concat([Uint8Array.of(0x4d), Uint8Array.of(b.length & 0xff, (b.length >> 8) & 0xff)]);
    return concat([head, b]);
  }
  function pushBytes(hexStr) { return pushFramed(hexToBytes(hexStr)); }
  function pushInt(v) {
    var n = BigInt(v);
    if (n < 0n || n >= (1n << 63n)) throw new Error('int out of canonical range: ' + v);
    return concat([Uint8Array.of(8), le64(n)]);
  }
  function pushByte1(v) { return Uint8Array.of(1, Number(v) & 0xff); }
  function encFactoryState(s) {
    return concat([pushBytes(s.program_hash), pushBytes(s.artist), pushInt(s.price), pushInt(s.royalty_bips), pushInt(s.mints_left), pushInt(s.engine_lang), pushBytes(s.render_hash), pushBytes(s.treasury)]);
  }
  function encEditionState(s) {
    return concat([pushBytes(s.ownerIdentifier), pushByte1(s.identifierType), pushInt(s.price), pushBytes(s.artist), pushInt(s.royalty_bips), pushBytes(s.program_hash), pushBytes(s.factory_covid), pushInt(s.serial)]);
  }
  function p2shHex(redeemBytes) { return 'aa20' + blakeHex(redeemBytes, 32) + '87'; }
  function factorySpk(mintsLeft) {
    var st = { program_hash: REG.series.program_hash, artist: REG.series.artist, price: REG.series.price, royalty_bips: REG.series.royalty_bips, mints_left: mintsLeft, engine_lang: REG.series.engine_lang, render_hash: REG.series.render_hash, treasury: REG.series.treasury };
    return p2shHex(concat([hexToBytes(REG.factoryPrefix), encFactoryState(st), hexToBytes(REG.factorySuffix)]));
  }
  function editionState(ed) {
    return { ownerIdentifier: ed.owner, identifierType: 0, price: ed.price, artist: REG.series.artist, royalty_bips: REG.series.royalty_bips, program_hash: REG.series.program_hash, factory_covid: REG.C, serial: ed.serial };
  }
  function editionSpk(ed) {
    return p2shHex(concat([hexToBytes(REG.editionPrefix), encEditionState(editionState(ed)), hexToBytes(REG.editionSuffix)]));
  }

  /* ---- ReliksSerialV10 LE63 polynomial ---- */
  function serialOfV10(txIdHex, idx) {
    var h = blake(concat([utf8('ReliksSerialV10'), hexToBytes(txIdHex), le32(idx)]), 32);
    var s = 0n;
    s += BigInt(h[0]);
    s += BigInt(h[1]) * 256n;
    s += BigInt(h[2]) * 65536n;
    s += BigInt(h[3]) * 16777216n;
    s += BigInt(h[4]) * 4294967296n;
    s += BigInt(h[5]) * 1099511627776n;
    s += BigInt(h[6]) * 281474976710656n;
    s += BigInt(h[7] % 128) * 72057594037927936n;
    if (s >= 9223372036854775807n) throw new Error('serial out of int64 range');
    return s.toString();
  }

  /* ---- generative engine (bundled, hash-anchored) ---- */
  function seedLanes(seedNum) {
    var h = blake(concat([utf8('ReliksSeedV10'), le64(BigInt(seedNum))]), 32);
    var dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    var lanes = [];
    for (var i = 0; i < 8; i++) lanes.push(dv.getInt32(i * 4, true));
    return lanes;
  }
  var _compiled = null;
  function engineFn() {
    if (!_compiled) _compiled = new Function('L', 'serial', REG.engineSrc + '\nreturn reliks(L,serial);');
    return _compiled;
  }
  function renderSeed(serialStr) { return Number(BigInt(serialStr) & 0xFFFFFFFFn); }
  function render(serialStr) { var s = renderSeed(serialStr); return engineFn()(seedLanes(s), s | 0); }

  /* ---- gates + chain checks ---- */
  function runGates() {
    var g = [];
    g.push(['blake2b self-test ("abc")', blakeHex(utf8('abc')) === 'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319']);
    g.push(['engine anchored: blake2b(bundled engine) == on-chain program_hash', blakeHex(utf8(REG.engineSrc)) === REG.series.program_hash]);
    var conf = false;
    try { conf = blakeHex(utf8(render(String(REG.testSerial)))) === REG.series.render_hash; } catch (e) { conf = false; }
    g.push(['render conformance: blake2b(render(' + REG.testSerial + ')) == on-chain render_hash', conf]);
    return g;
  }
  /* ---- bech32 (Kaspa addresses) for UTXO-set anchoring ---- */
  var B32C = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function expandKaspaPrefix(hrp) {
    var out = [];
    for (var i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 0x1f);
    return out;
  }
  function conv8to5(b) {
    var out = [];
    var acc = 0, bits = 0;
    for (var i = 0; i < b.length; i++) {
      acc = (acc << 8) | b[i];
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        out.push((acc >> bits) & 31);
        acc &= (1 << bits) - 1;
      }
    }
    if (bits > 0) out.push((acc << (5 - bits)) & 31);
    return out;
  }
  function kaspaPolymod(values) {
    var GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
    var c = 1n;
    for (var i = 0; i < values.length; i++) {
      var c0 = c >> 35n;
      c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(values[i]);
      if (c0 & 0x01n) c ^= GEN[0];
      if (c0 & 0x02n) c ^= GEN[1];
      if (c0 & 0x04n) c ^= GEN[2];
      if (c0 & 0x08n) c ^= GEN[3];
      if (c0 & 0x10n) c ^= GEN[4];
    }
    return c ^ 1n;
  }
  function bech32Encode(hrp, rawBytes) {
    var fivebit_payload = conv8to5(rawBytes);
    var fivebit_prefix = expandKaspaPrefix(hrp);
    var mod_input = fivebit_prefix.concat([0]).concat(fivebit_payload).concat([0, 0, 0, 0, 0, 0, 0, 0]);
    var checksum = kaspaPolymod(mod_input);
    var checksum_bytes = [];
    for (var i = 0; i < 5; i++) checksum_bytes.push(Number((checksum >> BigInt((4 - i) * 8)) & 0xffn));
    var fivebit_checksum = conv8to5(checksum_bytes);
    var all = fivebit_payload.concat(fivebit_checksum);
    var s2 = '';
    for (var i = 0; i < all.length; i++) s2 += B32C[all[i]];
    return hrp + ':' + s2;
  }
  function p2pkAddress(spkHex) { var b = hexToBytes(spkHex); return bech32Encode(REG.hrp, [0].concat(Array.prototype.slice.call(b.subarray(1, 33)))); }
  function p2shAddress(spkHex) { var b = hexToBytes(spkHex); return bech32Encode(REG.hrp, [8].concat(Array.prototype.slice.call(b.subarray(2, 34)))); }
  var _utxoCache = {};
  async function liveSpk(spkHex, txId, index) {
    var addr;
    try { addr = p2shAddress(spkHex); } catch (e) { return null; }
    try {
      if (!_utxoCache[addr]) {
        var r = await fetch(REG.rest + '/addresses/' + addr + '/utxos');
        if (!r.ok) return null;
        _utxoCache[addr] = await r.json();
      }
    } catch (e) { return null; }
    var list = _utxoCache[addr] || [];
    for (var i = 0; i < list.length; i++) if (list[i].outpoint.transactionId === txId && list[i].outpoint.index === index) {
      var sp = list[i].utxoEntry.scriptPublicKey;
      return typeof sp === 'string' ? sp : (sp.scriptPublicKey || sp.script_public_key || '');
    }
    return null;
  }
  function fetchTx(id) {
    return fetch(REG.rest + '/transactions/' + id).then(function (r) {
      if (!r.ok) throw new Error('tx fetch failed ' + id + ' (' + r.status + ')');
      return r.json();
    });
  }
  function spkOf(out) { var s = out.script_public_key || out.scriptPublicKey; if (!s) return ''; return typeof s === 'string' ? s : (s.scriptPublicKey || s.script_public_key || ''); }
  function spkClaimMatches(claim, recomputed) {
    if (claim === recomputed) return true;
    try { return new TextDecoder().decode(hexToBytes(claim)) === recomputed; } catch (e) { return false; }
  }
  function prevOf(inp) {
    var h = inp.previous_outpoint_hash || (inp.previousOutpoint && (inp.previousOutpoint.transactionId || inp.previousOutpoint.transaction_id));
    var i = inp.previous_outpoint_index !== undefined ? inp.previous_outpoint_index : (inp.previousOutpoint && inp.previousOutpoint.index);
    return h + ':' + i;
  }
  async function verifyAll() {
    var gates = runGates();
    var gateOk = gates.every(function (x) { return x[1]; });
    var globalChecks = [];
    var perEd = [];
    var eds = REG.editions || [];
    if (gateOk) {
      try {
        var deployTx = await fetchTx(REG.genesisTxId);
        globalChecks.push(['genesis lane spk == deployTx.outputs[0] (spent; archival source)', factorySpk(REG.initMints) === spkOf(deployTx.outputs[0])]);
      } catch (e) { globalChecks.push(['fetch deploy tx: ' + (e.message || e), false]); }
    }
    for (var i = 0; i < eds.length; i++) {
      var ed = eds[i];
      var checks = [];
      if (!gateOk) { perEd.push({ ed: ed, checks: checks, skip: true }); continue; }
      checks.push(['registry self-consistency: edition spk recomputes (ledger encoding normalized)', spkClaimMatches(ed.spk, editionSpk(ed))]);
      var consumed = i === 0 ? REG.genesisTxId : (eds[i - 1].mintTxId || eds[i - 1].txId);
      try {
        var mintTx = await fetchTx(ed.mintTxId || ed.txId);
        checks.push(['mint consumes lane ' + consumed.slice(0, 8) + '...:0', prevOf(mintTx.inputs[0]) === consumed + ':0']);
        checks.push(['serial recomputes from lane outpoint', serialOfV10(consumed, 0) === String(ed.serial)]);
        var edSpkLive = await liveSpk(editionSpk(ed), ed.txId, ed.index);
        checks.push([edSpkLive === null ? 'edition spk == mintTx.outputs[' + ed.index + '] (not in live UTXO set; archival source)' : 'edition spk == LIVE UTXO set (never pruned)', edSpkLive === null ? editionSpk(ed) === spkOf(mintTx.outputs[ed.index]) : edSpkLive === editionSpk(ed)]);
        var contSpkLive = await liveSpk(factorySpk(REG.initMints - i - 1), ed.mintTxId || ed.txId, 0);
        checks.push([contSpkLive === null ? 'continuation spk (mints_left=' + (REG.initMints - i - 1) + ') == mintTx.outputs[0] (spent; archival source)' : 'continuation spk (mints_left=' + (REG.initMints - i - 1) + ') == LIVE UTXO set (never pruned)', contSpkLive === null ? factorySpk(REG.initMints - i - 1) === spkOf(mintTx.outputs[0]) : contSpkLive === factorySpk(REG.initMints - i - 1)]);
      } catch (e) { checks.push(['fetch mint tx: ' + (e.message || e), false]); }
      perEd.push({ ed: ed, checks: checks });
    }
    return { gates: gates, globalChecks: globalChecks, perEd: perEd, gateOk: gateOk };
  }

  /* ---- UI ---- */
  async function runAll() {
    var badge = function (ok) { return '<span class="' + (ok ? 'pass' : 'fail') + '">' + (ok ? 'PASS' : 'FAIL') + '</span>'; };
    var res;
    try { res = await verifyAll(); }
    catch (e) { document.getElementById('status').innerHTML = '<span class="fail">ERROR: ' + String(e.message || e) + '</span>'; return; }
    var html = '<h2>Trust gates &amp; lineage</h2><ul>';
    res.gates.concat(res.globalChecks).forEach(function (g) { html += '<li>' + badge(g[1]) + ' ' + g[0] + '</li>'; });
    html += '</ul>';
    document.getElementById('status').innerHTML = html;
    var cards = document.getElementById('editions');
    cards.innerHTML = '';
    res.perEd.forEach(function (item) {
      var ok = !item.skip && item.checks.length > 0 && item.checks.every(function (c) { return c[1]; });
      var card = document.createElement('div');
      card.className = 'card';
      var list = '<ul>';
      item.checks.forEach(function (c) { list += '<li>' + badge(c[1]) + ' ' + c[0] + '</li>'; });
      list += '</ul>';
      card.innerHTML = '<h3>Edition · serial ' + item.ed.serial + (ok ? ' <span class="pass">VERIFIED</span>' : ' <span class="fail">NOT VERIFIED</span>') + '</h3>' +
        '<div class="meta">covenant ' + item.ed.cov.slice(0, 16) + '… · mint <a href="' + REG.explorer + (item.ed.mintTxId || item.ed.txId) + '" target="_blank" rel="noopener">' + (item.ed.mintTxId || item.ed.txId).slice(0, 12) + '…</a> · owner ' + item.ed.owner.slice(0, 12) + '…</div>' + list;
      if (ok) {
        var frame = document.createElement('iframe');
        frame.setAttribute('sandbox', '');
        frame.className = 'art';
        frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style></head><body><!-- SVG_WRAP -->' + render(String(item.ed.serial)).replace('<svg ', '<svg width="100%" height="100%" ') + '</body></html>';
        card.appendChild(frame);
      } else {
        var warn = document.createElement('div');
        warn.className = 'refuse';
        warn.textContent = 'Art withheld: verification failed.';
        card.appendChild(warn);
      }
      cards.appendChild(card);
    });
  }

  root.ReliksGallery = { runAll: runAll, verifyAll: verifyAll, runGates: runGates, render: render, renderSeed: renderSeed, serialOfV10: serialOfV10, encFactoryState: encFactoryState, encEditionState: encEditionState, editionState: editionState, factorySpk: factorySpk, editionSpk: editionSpk, p2shHex: p2shHex, p2pkAddress: p2pkAddress, p2shAddress: p2shAddress, liveSpk: liveSpk, blakeHex: blakeHex, hexToBytes: hexToBytes, bytesToHex: bytesToHex, utf8: utf8, concat: concat };
})(typeof self !== 'undefined' ? self : this);
