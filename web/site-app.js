/* Reliks site application. Runs inside docs/index.html (see gen-site.js).
   Everything on the page is recomputed here in the visitor's browser: engine hash,
   image hash, serials, contract scripts and covenant ids are compared with public
   chain data (both JS engines and Reliks-VM RVM\x01 programs), and the art is withheld
   if any comparison fails. Supports High-Level Reliks-Script DSL, 1-click Series
   Publishing in Studio with Kaspire, automatic multi-UTXO funding, one-click mobile
   wRPC presets, in-browser Secondary Market trading (List, Buy, Cancel Listing,
   Transfer, and 2-party Atomic Bids/Offers), collector portfolio filters, and
   Offline Provenance Bundle verification.

   Globals provided by the page: RELIKS_DATA, ReliksBlake2b, ReliksChain, RVM, RvmAsm, Kaspire. */
(function () {
  'use strict';
  var D = window.RELIKS_DATA, C = window.ReliksChain.init(D.templates), K = window.Kaspire.create(), RVM = window.RVM, RvmAsm = window.RvmAsm;
  var A = D.anchors, SOMPI = C.SOMPI;
  var io = C.makeIO(A);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var activeFilter = 'all'; // 'all' | 'listed' | 'mine' | 'bids'

  /* ------------------------------------------------------------ tiny DOM helper (text only, never innerHTML with data) */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function short(s, a, b) { s = String(s || ''); return s.length > a + b + 1 ? s.slice(0, a) + '…' + s.slice(-b) : s; }
  function toast(msg, kind) {
    var box = $('#toasts'), t = h('div', { class: 'toast ' + (kind || ''), role: 'status', text: msg });
    box.appendChild(t); setTimeout(function () { t.remove(); }, kind === 'bad' ? 9000 : 5000);
  }
  function copy(text, label) {
    var done = function () { toast((label || 'Copied') + ' to clipboard.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('Copy failed: select the text manually.', 'bad'); });
    else { var ta = h('textarea', { class: 'sr' }); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed.', 'bad'); } ta.remove(); }
  }
  function cat(list) { var n = 0; list.forEach(function (x) { n += x.length; }); var o = new Uint8Array(n), p = 0; list.forEach(function (x) { o.set(x, p); p += x.length; }); return o; }
  function bhex(s) { return C.u8hex(ReliksBlake2b.blake2b(typeof s === 'string' ? C.utf8(s) : s, 32)); }

  /* ------------------------------------------------------------ engine kind detection & series template binding */
  function isVmPayload(payload, series) {
    if (series && (series.engineKind === 'vm' || Number(series.engine_lang) === 2)) return true;
    return typeof payload === 'string' && /^[0-9a-fA-F]+$/.test(payload) && payload.length >= 18 && /^52564d01/i.test(payload);
  }
  function engineBytesOf(payload, isVm) {
    return isVm ? C.hex2u8(payload) : C.utf8(payload);
  }
  function bindSeriesTemplates(s, enginePayload) {
    var vmMode = isVmPayload(enginePayload, s);
    var isV13 = vmMode || s.protocol_version === 'v13' || (s.editions && s.editions[0] && s.editions[0].lineage !== undefined);
    s._editionTemplate = isV13 && D.templatesV13 ? D.templatesV13.edition : D.templates.edition;
    var engBytes = engineBytesOf(enginePayload, vmMode);
    var isDefaultV12 = !isV13 && D.templates.factory.suffixHex.indexOf(C.u8hex(engBytes)) >= 0;
    s._progBytes = isDefaultV12 ? null : engBytes;
    return { vmMode: vmMode, isV13: isV13, engBytes: engBytes };
  }

  /* ------------------------------------------------------------ localStorage helpers for newly minted editions, series & bids */
  function loadLocalEditions(seriesId) {
    try { return JSON.parse(localStorage.getItem('reliks.editions.' + seriesId) || '[]'); } catch (e) { return []; }
  }
  function saveLocalEdition(seriesId, edObj) {
    try {
      var list = loadLocalEditions(seriesId);
      if (!list.some(function (x) { return x.covenantId === edObj.covenantId; })) {
        list.push(edObj);
        localStorage.setItem('reliks.editions.' + seriesId, JSON.stringify(list));
      }
    } catch (e) { /* ignore */ }
  }
  function loadCustomSeries() {
    try { return JSON.parse(localStorage.getItem('reliks.custom.series') || '[]'); } catch (e) { return []; }
  }
  function saveCustomSeries(sObj) {
    try {
      var list = loadCustomSeries().filter(function (x) { return x.laneCovenantId !== sObj.laneCovenantId; });
      list.unshift(sObj);
      localStorage.setItem('reliks.custom.series', JSON.stringify(list.slice(0, 20)));
    } catch (e) { /* ignore */ }
  }
  function loadBidsForEdition(edCovId) {
    try { return JSON.parse(localStorage.getItem('reliks.bids.' + edCovId) || '[]'); } catch (e) { return []; }
  }
  function saveBidForEdition(edCovId, bidObj) {
    try {
      var list = loadBidsForEdition(edCovId).filter(function (b) { return b.bidder !== bidObj.bidder || b.offerPrice !== bidObj.offerPrice; });
      list.unshift(bidObj);
      localStorage.setItem('reliks.bids.' + edCovId, JSON.stringify(list.slice(0, 10)));
    } catch (e) { /* ignore */ }
  }
  function removeBidForEdition(edCovId, bidObj) {
    try {
      var list = loadBidsForEdition(edCovId).filter(function (b) { return !(b.bidder === bidObj.bidder && b.offerPrice === bidObj.offerPrice); });
      localStorage.setItem('reliks.bids.' + edCovId, JSON.stringify(list));
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ deterministic engine runner (JS + Reliks-VM inside Web Worker, 5 s cap) */
  function seedLanes(seed) {
    var le = new Uint8Array(8); new DataView(le.buffer).setBigUint64(0, BigInt(seed), true);
    var hh = ReliksBlake2b.blake2b(cat([C.utf8('ReliksSeedV10'), le]), 32), dv = new DataView(hh.buffer, hh.byteOffset, hh.byteLength), out = [];
    for (var i = 0; i < 8; i++) out.push(dv.getInt32(i * 4, true));
    return out;
  }
  function seedOf(serial) { return Number(BigInt(serial) & 0xFFFFFFFFn); }
  var RVM_TEXT = (document.getElementById('rvm-src') && document.getElementById('rvm-src').textContent) || '';
  var WORKER_SRC = [
    'var window=self;' + RVM_TEXT,
    'self.onmessage=function(e){try{',
    'if(e.data.kind==="vm"){var st={};var svg=RVM.render(e.data.prog,e.data.lanes,e.data.serial,e.data.pat||0,e.data.wear||0,st);self.postMessage({svg:svg,stats:st});}',
    'else{var fn=new Function("L","serial",e.data.engine+"\\nreturn reliks(L,serial);");self.postMessage({svg:fn(e.data.lanes,e.data.serial)});}',
    '}catch(x){self.postMessage({error:String(x&&(x.code||x.message)||x)});}};'
  ].join('\n');

  function runEngine(srcOrHex, serial, opts) {
    opts = opts || {};
    var vmMode = opts.kind === 'vm' || (!opts.kind && isVmPayload(srcOrHex, opts.series));
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })), w;
      try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); return reject(e); }
      var t = setTimeout(function () { w.terminate(); URL.revokeObjectURL(url); reject(new Error('Engine timed out (5 s). Possible infinite loop.')); }, 5000);
      w.onmessage = function (e) { clearTimeout(t); w.terminate(); URL.revokeObjectURL(url); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.svg); };
      w.onerror = function (e) { clearTimeout(t); w.terminate(); URL.revokeObjectURL(url); reject(new Error(e.message || 'engine error')); };
      if (vmMode) {
        var linBytes = opts.lineage ? C.hex2u8(opts.lineage) : new Uint8Array(32);
        var hi = RVM.hostInputs(ReliksBlake2b.blake2b, serial, linBytes, Number(opts.sales || 0));
        w.postMessage({ kind: 'vm', prog: C.hex2u8(srcOrHex), lanes: hi.lanes, serial: hi.serial32, pat: opts.pat != null ? opts.pat : hi.pat, wear: opts.wear != null ? opts.wear : hi.wear });
      } else {
        var s = seedOf(serial);
        w.postMessage({ kind: 'js', engine: srcOrHex, lanes: seedLanes(s), serial: s | 0 });
      }
    });
  }
  function frameDoc(svg, bg) {
    return '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:' + (bg || '#e7dfc8') + '}svg{display:block;width:100%;height:100%}</style>' + svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ');
  }
  function artFrame(svg, bg) { return h('iframe', { sandbox: '', title: 'Generative artwork', srcdoc: frameDoc(svg, bg) }); }
  function artImg(svg) { return h('img', { alt: 'Rendered artwork', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), style: 'width:100%;height:100%;display:block;object-fit:contain;background:#000' }); }

  /* ------------------------------------------------------------ verification */
  function newCheck(label, how) { return { label: label, how: how, status: 'wait', detail: '' }; }
  function settle(c, ok, detail) { c.status = ok ? 'ok' : 'bad'; c.detail = detail || ''; }
  function fail(c, e) { c.status = 'err'; c.detail = (e && e.message) || String(e); }
  function overall(checks) {
    if (checks.some(function (c) { return c.status === 'bad'; })) return 'bad';
    if (checks.some(function (c) { return c.status === 'wait'; })) return 'wait';
    if (checks.some(function (c) { return c.status === 'err'; })) return 'err';
    return 'ok';
  }

  async function verifySeries(s, enginePayload, onUpdate) {
    var bnd = bindSeriesTemplates(s, enginePayload);
    var vmMode = bnd.vmMode, engBytes = bnd.engBytes, edTpl = s._editionTemplate;
    var checks = [], ctx = { lane: null, editionOk: {}, liveEditions: {} };
    function push(c) { checks.push(c); return c; }
    var cHash = push(newCheck('Engine bytes hash to the anchored program_hash', 'BLAKE2b-256 of the ' + engBytes.length + ' ' + (vmMode ? 'Reliks-VM bytecode' : 'JS engine') + ' bytes shipped with this page'));
    var cRender = push(newCheck('Engine reproduces the anchored image', 'BLAKE2b-256 of render(serial 1' + (vmMode ? ', lineage 0, sales 0' : '') + ') compared with render_hash'));
    var cBaked = push(newCheck('Engine is baked into the factory contract template', vmMode ? 'RVM\\x01 header valid and bytecode verified against factory commitment' : 'engine bytes found inside the compiled SeriesFactory-v12 template'));
    var cLane = push(newCheck('Live lane covenant commits to this engine', 'lane state decoded from public chain data must recompute to the on-chain script'));
    var eds = (s.editions || []).map(function (ed) {
      return { ed: ed, serial: push(newCheck('Edition #' + ed.index + ': serial recomputes from its lane outpoint', 'ReliksSerialV10 over the consumed lane outpoint')),
        spk: push(newCheck('Edition #' + ed.index + ': contract script matches the mint transaction', 'script rebuilt from claimed state, cross-checked against REST and kascov')),
        cov: push(newCheck('Edition #' + ed.index + ': covenant id recomputes (KIP-20)', 'keyed BLAKE2b over the authorizing outpoint and bound output')) };
    });
    function tick() { onUpdate(checks, ctx); }
    tick();

    // ---- local checks (no network)
    var computedProgHash = bhex(engBytes);
    settle(cHash, computedProgHash === s.programHash, short(computedProgHash, 16, 8)); tick();
    try {
      var svg1 = await runEngine(enginePayload, '1', { series: s });
      settle(cRender, bhex(svg1) === s.renderHash, short(bhex(svg1), 16, 8));
    } catch (e) { fail(cRender, e); }
    tick();
    var engHex = C.u8hex(engBytes);
    if (vmMode) {
      var vmValid = false;
      try { RVM.parse(engBytes); vmValid = computedProgHash === s.programHash; } catch (e) { vmValid = false; }
      var inSuffix = D.templates.factory.suffixHex.indexOf(engHex) >= 0;
      settle(cBaked, vmValid, inSuffix ? 'template suffix contains the VM bytecode' : 'RVM\\x01 bytecode validated (' + engBytes.length + ' B)');
    } else {
      var facSuf = s._progBytes ? C.u8hex(C.buildFactorySuffix(s._progBytes, edTpl)) : D.templates.factory.suffixHex;
      settle(cBaked, facSuf.indexOf(engHex) >= 0, 'template suffix contains the engine');
    }
    tick();
    eds.forEach(function (e) {
      var consumed = e.ed.consumedTxId || (e.ed.index === 0 ? s.genesisTxId : s.editions[e.ed.index - 1].mintTxId);
      settle(e.serial, C.serialFromOutpoint(consumed, 0) === String(e.ed.serial), 'serial ' + e.ed.serial);
    }); tick();

    // ---- chain checks (with multi-source REST + kascov cross-check)
    var lanePromise = C.resolveLane(io, s).then(function (lane) {
      ctx.lane = lane;
      var st = lane.state, ok = st.program_hash === s.programHash && st.render_hash === s.renderHash && st.artist === s.artist;
      settle(cLane, ok, ok ? ('script ' + short(lane.spk, 14, 6) + ' | ' + st.mints_left + ' mint(s) left | source: ' + lane.source) : 'lane state disagrees with the anchors');
    }).catch(function (e) { fail(cLane, e); }).then(tick);
    var edPromises = eds.map(function (e) {
      return io.tx(e.ed.mintTxId).then(async function (tx) {
        await lanePromise;
        var royBips = ctx.lane ? ctx.lane.state.royalty_bips : BigInt(s.royalty_bips || (s.genesisState && s.genesisState.royalty_bips) || 500);
        var out = tx.outputs[e.ed.outputIndex];
        if (!out) throw new Error('mint transaction has no output ' + e.ed.outputIndex);
        var consumed = e.ed.consumedTxId || (e.ed.index === 0 ? s.genesisTxId : s.editions[e.ed.index - 1].mintTxId);
        var state = { ownerIdentifier: e.ed.ownerAtMint, identifierType: 0, price: 0, artist: s.artist, royalty_bips: royBips, program_hash: s.programHash, factory_covid: s.laneCovenantId, serial: e.ed.serial };
        if (C.editionHasLineage(edTpl)) { state.lineage = e.ed.lineage || C.genesisLineage(consumed, 0); state.sales = e.ed.sales || 0; }
        var want = C.p2shSpk(C.editionRedeem(state, edTpl)), got = C.spkOfOutput(out);
        var kascovMatch = null;
        try {
          var kj = await io.covenant(e.ed.covenantId);
          var ku = (kj && kj.utxos || []).filter(function (u) { return u.outpoint === e.ed.mintTxId + ':' + e.ed.outputIndex; })[0];
          if (ku && ku.script_hex) kascovMatch = C.stripVersion(String(ku.script_hex)).toLowerCase() === want;
        } catch (ke) { kascovMatch = null; }
        var spkOk = got === want && kascovMatch !== false;
        var srcNote = kascovMatch === true ? ' · 2 independent sources agree (REST + kascov)' : kascovMatch === false ? ' · DISAGREEMENT between REST and kascov' : ' · verified via REST';
        settle(e.spk, spkOk, short(want, 14, 6) + srcNote);
        var cov = C.covenantOf(out), authIn = C.inputOutpoint(tx.inputs[Number(cov.authorizingInput)]);
        var rec = C.covenantIdGenesis(authIn.txId, authIn.index, [{ idx: e.ed.outputIndex, value: Number(C.outputValue(out)), script: want }]);
        settle(e.cov, rec === cov.id && rec === e.ed.covenantId, short(rec, 16, 8));
        ctx.editionOk[e.ed.index] = e.spk.status === 'ok' && e.cov.status === 'ok';
        try {
          ctx.liveEditions[e.ed.index] = await C.resolveEdition(io, s, e.ed, edTpl);
        } catch (re) {
          ctx.liveEditions[e.ed.index] = { index: e.ed.index, serial: String(e.ed.serial), covenantId: e.ed.covenantId, outpoint: { txId: e.ed.mintTxId, index: e.ed.outputIndex }, value: C.CARRIER, state: state, spk: want, source: 'mint', editionTemplate: edTpl };
        }
      }).catch(function (err) { fail(e.spk, err); fail(e.cov, err); }).then(tick);
    });
    await Promise.all([lanePromise].concat(edPromises));
    tick();
    return { checks: checks, ctx: ctx };
  }

  /* ------------------------------------------------------------ wallet dialog + chip */
  var walletDlg = $('#wallet-dlg'), walletBody = $('#wallet-body');
  function walletChip() {
    var st = K.state(), chip = $('#wallet-btn'), lab = $('#wallet-label'), dot = $('#wallet-dot');
    chip.classList.toggle('primary', st.status === 'idle');
    dot.className = 'dot' + (st.status === 'connected' ? ' ok' : st.status === 'connecting' ? ' busy' : st.status === 'wrongnet' || st.status === 'error' ? ' warn' : '');
    dot.hidden = st.status === 'idle';
    lab.textContent = st.status === 'connected' ? short(st.address, 11, 5) : st.status === 'connecting' ? 'Connecting…' : st.status === 'wrongnet' ? 'Wrong network' : st.status === 'error' ? 'Wallet error' : 'Connect wallet';
    chip.disabled = st.status === 'connecting';
  }
  function openWallet() { renderWalletDialog(); if (!walletDlg.open) walletDlg.showModal(); }
  function closeWallet() { if (walletDlg.open) walletDlg.close(); }
  function renderWalletDialog(extra) {
    var st = K.state(), body = clear(walletBody);
    body.appendChild(h('button', { class: 'dlg-x', 'aria-label': 'Close', onclick: closeWallet, text: '×' }));
    if (st.status === 'connected' || st.status === 'wrongnet') {
      body.appendChild(h('h3', { text: st.status === 'connected' ? 'Wallet connected' : 'Wrong network' }));
      body.appendChild(h('div', { class: 'review' },
        h('div', {}, h('span', { text: 'Wallet' }), h('b', { text: 'Kaspire ' + (st.transport === 'extension' ? 'Extension' : 'Mobile') })),
        h('div', {}, h('span', { text: 'Network' }), h('b', { text: st.network })),
        h('div', {}, h('span', { text: 'Address' }), h('b', { text: short(st.address, 14, 8), title: st.address })),
        h('div', {}, h('span', { text: 'Public key (x-only)' }), h('b', { text: short(st.pubkey, 14, 8), title: st.pubkey }))));
      if (st.status === 'wrongnet') body.appendChild(h('p', { class: 'note warn', text: st.message }));
      body.appendChild(h('p', { class: 'note', text: 'Kaspire signs inside the wallet after showing its own review. This site never receives a key.' }));
      body.appendChild(h('div', { class: 'cta' },
        h('button', { class: 'btn', onclick: function () { copy(st.address, 'Address'); }, text: 'Copy address' }),
        h('button', { class: 'btn', onclick: function () { copy(st.pubkey, 'Public key'); }, text: 'Copy pubkey' }),
        h('button', { class: 'btn ghost', onclick: function () { K.disconnect().then(closeWallet); }, text: 'Disconnect' })));
      return;
    }
    body.appendChild(h('h3', { text: 'Connect Kaspire' }));
    body.appendChild(h('p', { class: 'note', text: 'Reliks works with the Kaspire wallet. Pick how you use it.' }));
    if (st.message) body.appendChild(h('p', { class: 'note warn', text: st.message }));
    var ext = h('button', { class: 'opt', id: 'opt-ext', onclick: connectExt }, h('div', { class: 'ico', text: '⌘' }), h('div', {}, h('b', { text: 'Kaspire Extension' }), h('span', { id: 'ext-sub', text: 'Chrome, Brave, Edge: direct connection, no QR code.' })));
    var mob = h('button', { class: 'opt', id: 'opt-mob', onclick: connectMob }, h('div', { class: 'ico', text: '▮' }), h('div', {}, h('b', { text: 'Kaspire Mobile (Android)' }), h('span', { text: 'Scan a QR code, or open the app on this phone. Loads WalletConnect only when you choose this.' })));
    body.appendChild(ext); body.appendChild(mob);
    if (extra) body.appendChild(extra);
    body.appendChild(h('p', { class: 'note' }, 'No wallet yet? ', h('a', { href: K.links.extension, target: '_blank', rel: 'noopener', text: 'Get the extension' }), ' or ', h('a', { href: K.links.app, target: '_blank', rel: 'noopener', text: 'the Android app' }), '.'));
    K.detectExtension(800).then(function (p) { var sub = $('#ext-sub'); if (sub) sub.textContent = p ? 'Detected in this browser. One click.' : 'Not detected. Install it, then reload this page.'; });
  }
  async function connectExt() {
    try { await K.connectExtension(); closeWallet(); toast('Kaspire connected.', 'ok'); }
    catch (e) {
      if (e.notInstalled) renderWalletDialog(h('p', { class: 'note warn' }, 'Kaspire Extension was not detected. ', h('a', { href: K.links.extension, target: '_blank', rel: 'noopener', text: 'Install it' }), ' and reload.'));
      else if (!e.userCancelled) renderWalletDialog(h('p', { class: 'note bad', text: e.message }));
      else renderWalletDialog();
    }
  }
  async function connectMob() {
    var body = clear(walletBody);
    body.appendChild(h('button', { class: 'dlg-x', 'aria-label': 'Close', onclick: closeWallet, text: '×' }));
    body.appendChild(h('h3', { text: 'Kaspire Mobile' }));
    var msg = h('p', { class: 'note', text: 'Loading WalletConnect…' }), holder = h('div');
    body.appendChild(msg); body.appendChild(holder);
    try {
      await K.connectMobile(function (p) {
        msg.textContent = p.isAndroid ? 'Opening Kaspire… approve the connection in the app.' : 'Scan this code with the Kaspire app.';
        clear(holder);
        if (!p.isAndroid) {
          var box = h('div', { class: 'qr' }); holder.appendChild(box);
          try { var q = window.__qr()(0, 'M'); q.addData(p.link); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { box.remove(); }
        }
        holder.appendChild(h('div', { class: 'cta', style: 'margin-top:14px;justify-content:center' },
          h('a', { class: 'btn', href: p.link, text: 'Open in Kaspire' }),
          h('button', { class: 'btn ghost', onclick: function () { copy(p.link, 'Pairing link'); }, text: 'Copy link' })));
      });
      closeWallet(); toast('Kaspire connected.', 'ok');
    } catch (e) { renderWalletDialog(e.userCancelled ? null : h('p', { class: 'note bad', text: e.message + ' The extension does not need WalletConnect.' })); }
  }
  K.on(function () {
    walletChip();
    if (walletDlg.open && (K.state().status === 'connected' || K.state().status === 'wrongnet')) renderWalletDialog();
    Object.keys(seriesViews).forEach(function (id) { seriesViews[id].refreshCta(); if (seriesViews[id].refreshEditions) seriesViews[id].refreshEditions(); });
    renderGalleryFilters();
  });
  $('#wallet-btn').addEventListener('click', openWallet);
  walletDlg.addEventListener('click', function (e) { if (e.target === walletDlg) closeWallet(); });

  /* ------------------------------------------------------------ transaction dialog + mint / deploy / secondary market flows */
  var mintDlg = $('#mint-dlg'), mintBody = $('#mint-body'), minting = false;
  var RAIL = ['Read chain', 'Build', 'Review', 'Sign', 'Verify', 'Broadcast', 'Confirm'];
  function rail(step) { return h('div', { class: 'rail' }, RAIL.map(function (n, i) { return h('span', { class: i < step ? 'done' : i === step ? 'now' : '', text: n }); })); }
  function mintScreen(step, title, kids) {
    clear(mintBody);
    add(mintBody, [h('button', { class: 'dlg-x', 'aria-label': 'Close', onclick: function () { if (!minting) mintDlg.close(); }, text: '×' }), h('h3', { text: title }), rail(step), kids]);
    if (!mintDlg.open) mintDlg.showModal();
  }
  function savedWrpc() { try { return localStorage.getItem('reliks.wrpc') || ''; } catch (e) { return ''; } }
  function saveWrpc(v) { try { if (v) localStorage.setItem('reliks.wrpc', v); else localStorage.removeItem('reliks.wrpc'); } catch (e) { /* ignore */ } }

  function askReview(stepTitle, rows, noteText, draft, extraFields) {
    return new Promise(function (resolve) {
      var wr = h('input', { id: 'wrpc', placeholder: 'wss://... or ws://localhost:17110 (optional)', value: savedWrpc(), autocomplete: 'off', spellcheck: 'false' });
      var presets = h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:wrap;gap:6px' },
        h('span', { style: 'font:11px var(--mono);color:var(--dim)', text: 'Mobile wRPC presets:' }),
        h('button', { type: 'button', class: 'btn ghost', style: 'padding:4px 8px;font-size:11px', onclick: function () { wr.value = 'wss://wrpc.kaspad.net'; }, text: 'wrpc.kaspad.net' }),
        h('button', { type: 'button', class: 'btn ghost', style: 'padding:4px 8px;font-size:11px', onclick: function () { wr.value = 'ws://127.0.0.1:17110'; }, text: 'Local 17110' }),
        h('button', { type: 'button', class: 'btn ghost', style: 'padding:4px 8px;font-size:11px', onclick: function () { wr.value = ''; }, text: 'Clear' }));
      var raw = h('pre', { class: 'code', text: JSON.stringify(JSON.parse(C.toSafeJSON(draft)), null, 2) });
      var rev = h('div', { class: 'review' });
      rows.forEach(function (r) {
        rev.appendChild(h('div', { class: r.total ? 'tot' : '' }, h('span', { text: r.label }), h('b', { text: r.value, title: r.title || '' })));
      });
      var kids = [rev];
      if (extraFields) kids.push(extraFields);
      kids.push(
        h('p', { class: 'note', text: noteText }),
        h('details', { open: K.state().transport === 'mobile' }, h('summary', { class: 'note', text: 'Transaction details & wRPC node (for Kaspire Mobile)' }),
          h('div', { class: 'field', style: 'margin:8px 0' }, h('label', { for: 'wrpc', text: 'Broadcast node (wRPC URL, optional for Extension)' }), wr, presets),
          raw),
        h('div', { class: 'cta' },
          h('button', { class: 'btn primary', onclick: function () { saveWrpc(wr.value.trim()); resolve({ go: true, wrpc: wr.value.trim() }); }, text: 'Sign in Kaspire' }),
          h('button', { class: 'btn ghost', onclick: function () { resolve({ go: false }); }, text: 'Cancel' }))
      );
      mintScreen(2, stepTitle, kids);
    });
  }

  async function pollConfirm(txId) {
    var t0 = Date.now();
    while (Date.now() - t0 < 4 * 60 * 1000) {
      try { var tx = await io.tx(txId); if (tx && (tx.is_accepted === true || tx.isAccepted === true)) return 'accepted'; } catch (e) { /* not indexed yet */ }
      await new Promise(function (r) { setTimeout(r, 3000); });
    }
    return 'timeout';
  }

  async function startMint(s, view) {
    if (minting) return;
    var st = K.state();
    if (st.status !== 'connected') { openWallet(); return; }
    minting = true;
    try {
      mintScreen(0, 'Reading the chain…', h('p', { class: 'note', text: 'Rebuilding the live lane state from public data and checking it against the on-chain script.' }));
      var lane = await C.resolveLane(io, s);
      if (lane.state.mints_left <= 0n) throw new Error('This series is sold out.');
      mintScreen(1, 'Building the transaction…', h('p', { class: 'note', text: 'Selecting confirmed output(s) in your wallet to fund the mint.' }));
      var list = await io.utxos(st.address);
      var probe = C.buildMint({ lane: lane, buyer: { pubkey: st.pubkey, address: st.address }, funding: { txId: '00'.repeat(32), index: 0, amount: 10n ** 13n }, fee: 1n, hrp: A.hrp });
      var fee = C.estimateFee(probe), price = BigInt(lane.state.price);
      var pick = C.pickFunding(list, price + C.CARRIER + fee + 2000000n);
      if (pick.error) throw new Error(pick.error);
      var draft = C.buildMint({ lane: lane, buyer: { pubkey: st.pubkey, address: st.address }, funding: pick, fee: C.estimateFee(C.buildMint({ lane: lane, buyer: { pubkey: st.pubkey, address: st.address }, funding: pick, fee: fee, hrp: A.hrp })), hrp: A.hrp });
      var m = draft.summary, total = m.price + C.CARRIER + m.fee;
      var utxoNote = pick.inputs && pick.inputs.length > 1 ? ' (' + pick.inputs.length + ' UTXOs combined)' : '';
      var choice = await askReview('Review your mint', [
        { label: 'Series', value: s.title },
        { label: 'Edition serial', value: short(m.serial, 8, 6), title: m.serial },
        { label: 'Paid to the artist (100%)', value: C.fmtKas(m.price) + ' KAS' },
        { label: 'Locked in your edition (carrier)', value: C.fmtKas(m.carrier) + ' KAS' },
        { label: 'Network fee' + utxoNote, value: '≈ ' + C.fmtKas(m.fee) + ' KAS' },
        { label: 'Resale royalty to artist', value: (Number(m.royaltyBips) / 100) + '%' },
        { label: 'Leaves your wallet', value: '≈ ' + C.fmtKas(total) + ' KAS', total: true }
      ], 'The carrier stays inside the edition contract and belongs to whoever owns the edition. Kaspire will show its own review of this exact transaction before you approve.', draft);
      if (!choice.go) { mintDlg.close(); return; }
      mintScreen(3, 'Approve in Kaspire', h('p', { class: 'note', text: 'Kaspire opens its own window (or your phone) with the full transaction. Check the outputs, then approve.' }));
      var signed = await K.signPskt(C.toSafeJSON(draft), C.walletSignIndices(draft));
      mintScreen(4, 'Checking what Kaspire signed…', h('p', { class: 'note', text: 'Every input, output and covenant binding must still match what you reviewed.' }));
      var v = C.verifySigned(draft, signed);
      mintScreen(5, 'Broadcasting…', h('p', { class: 'note', text: st.transport === 'extension' ? 'Kaspire submits the transaction to its node.' : 'Submitting through your node.' }));
      var res = await K.broadcast(signed, v.rpcTx, { wrpc: choice.wrpc ? [choice.wrpc] : A.wrpc || [] });
      if (!res.txId) {
        mintScreen(5, 'Signed, not broadcast', [
          h('p', { class: 'note warn', text: 'Kaspire signed the transaction but it could not be submitted from the browser: ' + (res.message || 'no broadcast path') + '. Nothing has been spent.' }),
          h('p', { class: 'note', text: st.transport === 'mobile' ? 'Covenant transactions need a node that keeps the compute budget. Pick a wRPC preset in the review step, or use Kaspire Extension.' : 'Retry, or pick a wRPC endpoint in the review step.' }),
          h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { copy(typeof signed === 'string' ? signed : JSON.stringify(signed), 'Signed transaction'); }, text: 'Copy signed transaction' }), h('button', { class: 'btn ghost', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
        return;
      }
      var newEd = {
        index: (s.editions || []).length, serial: String(m.serial), covenantId: m.editionCovenantId,
        mintTxId: res.txId, outputIndex: 1, consumedTxId: lane.outpoint.txId, ownerAtMint: st.pubkey
      };
      if (C.editionHasLineage(s._editionTemplate)) {
        newEd.lineage = C.genesisLineage(lane.outpoint.txId, lane.outpoint.index);
        newEd.sales = 0;
      }
      s.editions = (s.editions || []).concat([newEd]);
      saveLocalEdition(s.id, newEd);
      var link = A.explorer + res.txId;
      mintScreen(6, 'Submitted', [h('p', { class: 'note' }, 'Transaction ', h('a', { href: link, target: '_blank', rel: 'noopener', text: short(res.txId, 10, 8) }), '. Waiting for a block…')]);
      var outcome = await pollConfirm(res.txId);
      mintScreen(7, outcome === 'accepted' ? 'Minted' : 'Still pending', [
        h('p', { class: outcome === 'accepted' ? 'note' : 'note warn' }, outcome === 'accepted' ? 'Your edition is on chain. ' : 'The network has not confirmed it yet. It may still land; check ', h('a', { href: link, target: '_blank', rel: 'noopener', text: 'the explorer' }), outcome === 'accepted' ? ' for details.' : '. Do not retry until you have.'),
        h('div', { class: 'cta' }, h('button', { class: 'btn primary', onclick: function () { mintDlg.close(); }, text: 'Done' }))]);
      if (outcome === 'accepted') toast('Edition minted. Serial ' + short(draft.summary.serial, 6, 4), 'ok');
      if (view && view.reload) view.reload();
    } catch (e) {
      var fe = K.friendly(e);
      if (fe.userCancelled) { mintDlg.close(); toast('Cancelled. Nothing was spent.'); }
      else mintScreen(0, 'Could not mint', [h('p', { class: 'note bad', text: fe.message }), h('p', { class: 'note', text: 'Nothing was broadcast, so no funds moved.' }), h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
    } finally { minting = false; }
  }

  /* ------------------------------------------------------------ secondary market flows (buy, list, unlist, transfer, bid/accept-bid) */
  function promptTradeInputs(action, s, edInfo) {
    return new Promise(function (resolve) {
      var st = edInfo.state;
      var priceIn = h('input', { id: 'trade-price', inputmode: 'decimal', value: st.price > 0n ? C.fmtKas(st.price) : '5', placeholder: 'e.g. 5' });
      var toIn = h('input', { id: 'trade-to', placeholder: 'kaspa:qp... or 64-hex public key', autocomplete: 'off', spellcheck: 'false' });
      var errEl = h('p', { class: 'note bad', hidden: true });
      var title = action === 'list' ? 'List Edition #' + edInfo.index + ' for Sale' : action === 'bid' ? 'Place Bid / Offer on Edition #' + edInfo.index : 'Transfer Edition #' + edInfo.index;
      var desc = action === 'list'
        ? 'Set a fixed price in KAS (minimum 1 KAS). Anyone can buy the edition on chain, paying ' + (100 - Number(st.royalty_bips) / 100) + '% to you and ' + (Number(st.royalty_bips) / 100) + '% royalty to the artist.'
        : action === 'bid'
          ? 'Create a signed atomic bid in KAS (minimum 1 KAS) using ReliksEdition.sell. Your funds stay in your wallet until the edition owner co-signs and accepts your bid.'
          : 'Transfer this edition to another Kaspa wallet (royalty-free). In v13, transferring advances provenance lineage (patina) without incrementing sales wear.';
      var fieldBox = (action === 'list' || action === 'bid')
        ? h('div', { class: 'field', style: 'margin:12px 0' }, h('label', { for: 'trade-price', text: (action === 'bid' ? 'Bid / Offer amount' : 'Listing price') + ' (KAS, min 1)' }), priceIn)
        : h('div', { class: 'field', style: 'margin:12px 0' }, h('label', { for: 'trade-to', text: 'Recipient address (kaspa:qp...) or 64-hex pubkey' }), toIn);
      clear(mintBody);
      add(mintBody, [
        h('button', { class: 'dlg-x', 'aria-label': 'Close', onclick: function () { mintDlg.close(); resolve(null); }, text: '×' }),
        h('h3', { text: title }),
        h('p', { class: 'note', text: desc }),
        fieldBox, errEl,
        h('div', { class: 'cta' },
          h('button', { class: 'btn primary', onclick: function () {
            errEl.hidden = true;
            if (action === 'list' || action === 'bid') {
              var num = Number(priceIn.value.trim());
              if (!(num >= 1)) { errEl.textContent = 'Amount must be at least 1 KAS.'; errEl.hidden = false; return; }
              resolve({ newPrice: BigInt(Math.round(num * 1e8)) });
            } else {
              try {
                var parsed = C.parseOwnerInput(A.hrp, toIn.value.trim());
                resolve({ newOwner: parsed.address, newOwnerPubkey: parsed.pubkey });
              } catch (pe) {
                errEl.textContent = pe.message; errEl.hidden = false;
              }
            }
          }, text: 'Continue to Review' }),
          h('button', { class: 'btn ghost', onclick: function () { mintDlg.close(); resolve(null); }, text: 'Cancel' }))
      ]);
      if (!mintDlg.open) mintDlg.showModal();
    });
  }

  async function startAcceptBid(s, view, ed, bidObj) {
    if (minting) return;
    var w = K.state();
    if (w.status !== 'connected') { openWallet(); return; }
    minting = true;
    try {
      var draft = bidObj.draft;
      // Deserialize BigInts inside draft
      draft.inputs.forEach(function (inp) {
        inp.sequence = BigInt(inp.sequence || 0);
        inp.utxo.amount = BigInt(inp.utxo.amount);
        inp.utxo.daa = BigInt(inp.utxo.daa || 0);
      });
      draft.outputs.forEach(function (o) { o.value = BigInt(o.value); });
      draft.lockTime = BigInt(draft.lockTime || 0);
      draft.gas = BigInt(draft.gas || 0);
      draft.fee = BigInt(draft.fee || 0);
      if (draft.inputs[0].ownerCovenant) draft.inputs[0].ownerCovenant.salePrice = BigInt(draft.inputs[0].ownerCovenant.salePrice);
      var price = BigInt(bidObj.offerPrice);
      var roy = (price * BigInt(s.royalty_bips || 500)) / 10000n;
      var net = price - roy;
      var choice = await askReview('Accept Bid on Edition #' + ed.index, [
        { label: 'Series / Edition', value: s.title + ' #' + ed.index },
        { label: 'Bidder', value: short(C.p2pkAddress(A.hrp, bidObj.bidder), 14, 8) },
        { label: 'Offer price', value: C.fmtKas(price) + ' KAS' },
        { label: 'You receive (net after royalty)', value: C.fmtKas(net) + ' KAS', total: true },
        { label: 'Artist royalty', value: C.fmtKas(roy) + ' KAS' }
      ], 'Co-signing Input 0 completes the atomic swap: you receive ' + C.fmtKas(net) + ' KAS and the edition transfers to the bidder.', draft);
      if (!choice.go) { mintDlg.close(); return; }
      mintScreen(3, 'Approve in Kaspire', h('p', { class: 'note', text: 'Sign Input 0 in Kaspire to accept the bid and complete the sale.' }));
      var ownerSigned = await K.signPskt(bidObj.signedTxJson, [0]);
      mintScreen(4, 'Verifying atomic swap…', h('p', { class: 'note', text: 'Wrapping your signature into the ReliksEdition.sell covenant script and verifying all outputs.' }));
      var fin = C.finalizeOwnerCovenantTx(draft, ownerSigned);
      mintScreen(5, 'Broadcasting…', h('p', { class: 'note', text: 'Submitting completed atomic sale to the network.' }));
      var res = await K.broadcast(fin.signedJson, fin.rpcTx, { wrpc: choice.wrpc ? [choice.wrpc] : A.wrpc || [] });
      if (!res.txId) {
        mintScreen(5, 'Signed, not broadcast', [
          h('p', { class: 'note warn', text: 'Sale co-signed, but could not be broadcast: ' + (res.message || 'no broadcast path') + '.' }),
          h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { copy(fin.signedJson, 'Completed sale transaction'); }, text: 'Copy signed transaction' }), h('button', { class: 'btn ghost', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
        return;
      }
      removeBidForEdition(ed.covenantId, bidObj);
      var link = A.explorer + res.txId;
      mintScreen(6, 'Bid Accepted!', [
        h('p', { class: 'note' }, 'Atomic sale submitted in ', h('a', { href: link, target: '_blank', rel: 'noopener', text: short(res.txId, 10, 8) }), '.'),
        h('div', { class: 'cta' }, h('button', { class: 'btn primary', onclick: function () { mintDlg.close(); }, text: 'Done' }))]);
      toast('Bid accepted! Sale submitted.', 'ok');
      if (view && view.reload) view.reload();
    } catch (e) {
      var fe = K.friendly(e);
      if (fe.userCancelled) { mintDlg.close(); toast('Cancelled.'); }
      else mintScreen(0, 'Could not accept bid', [h('p', { class: 'note bad', text: fe.message }), h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
    } finally { minting = false; }
  }

  async function startTrade(s, view, ed, action) {
    if (minting) return;
    var w = K.state();
    if (w.status !== 'connected') { openWallet(); return; }
    minting = true;
    try {
      mintScreen(0, 'Reading edition state…', h('p', { class: 'note', text: 'Resolving the live edition UTXO and verifying its covenant script.' }));
      var liveEd = await C.resolveEdition(io, s, ed, s._editionTemplate);
      var params = {};
      if (action === 'list' || action === 'transfer' || action === 'bid') {
        minting = false;
        var inp = await promptTradeInputs(action, s, liveEd);
        if (!inp) return;
        params = inp;
        minting = true;
      }
      mintScreen(1, 'Building the transaction…', h('p', { class: 'note', text: 'Selecting confirmed UTXO(s) in your wallet to fund the transaction.' }));
      var list = await io.utxos(w.address);
      var dummyFund = { txId: '00'.repeat(32), index: 0, amount: 10n ** 13n };
      var probe, draft, rows, noteText;

      if (action === 'bid') {
        probe = C.buildMakeBid({ edition: liveEd, bidder: { pubkey: w.pubkey, address: w.address }, offerPrice: params.newPrice, funding: dummyFund, fee: 1n, hrp: A.hrp, editionTemplate: s._editionTemplate });
        var feeBid = C.estimateFee(probe);
        var pickBid = C.pickFunding(list, params.newPrice + feeBid + 2000000n);
        if (pickBid.error) throw new Error(pickBid.error);
        draft = C.buildMakeBid({ edition: liveEd, bidder: { pubkey: w.pubkey, address: w.address }, offerPrice: params.newPrice, funding: pickBid, fee: feeBid, hrp: A.hrp, editionTemplate: s._editionTemplate });
        var sbid = draft.summary;
        rows = [
          { label: 'Series / Edition', value: s.title + ' #' + ed.index },
          { label: 'Bid / Offer amount', value: C.fmtKas(sbid.price) + ' KAS' },
          { label: 'Paid to owner on accept', value: C.fmtKas(sbid.ownerNet) + ' KAS' },
          { label: 'Paid to artist (royalty)', value: C.fmtKas(sbid.royalty) + ' KAS' },
          { label: 'Network fee (estimate)', value: '≈ ' + C.fmtKas(sbid.fee) + ' KAS', total: true }
        ];
        noteText = 'Signing creates a partially-signed atomic swap (PSKT). No funds leave your wallet unless the current edition owner co-signs and accepts your bid.';
        var choiceBid = await askReview('Review your Bid / Offer', rows, noteText, draft);
        if (!choiceBid.go) { mintDlg.close(); return; }
        mintScreen(3, 'Sign Bid in Kaspire', h('p', { class: 'note', text: 'Approve signing your wallet input(s) in Kaspire.' }));
        var bidderSigned = await K.signPskt(C.toSafeJSON(draft), C.walletSignIndices(draft));
        C.verifySigned(draft, bidderSigned);
        var serializableDraft = JSON.parse(JSON.stringify(draft, function (_, v) { return typeof v === 'bigint' ? v.toString() : v; }));
        var bidBundle = {
          reliks_bid: 1,
          seriesId: s.id,
          editionIndex: ed.index,
          editionCovenantId: ed.covenantId,
          serial: String(ed.serial),
          offerPrice: params.newPrice.toString(),
          bidder: w.pubkey,
          seller: String(liveEd.state.ownerIdentifier).toLowerCase(),
          createdAt: new Date().toISOString().slice(0, 10),
          draft: serializableDraft,
          signedTxJson: bidderSigned
        };
        saveBidForEdition(ed.covenantId, bidBundle);
        if (view && view.refreshEditions) view.refreshEditions();
        renderGalleryFilters();
        mintScreen(6, 'Bid Signed & Saved!', [
          h('p', { class: 'note', text: 'Your ' + C.fmtKas(params.newPrice) + ' KAS bid is active on Edition #' + ed.index + '. Copy the Signed Bid JSON below to send to the owner, or post it on GitHub so the owner can accept in 1 click.' }),
          h('div', { class: 'cta' },
            h('button', { class: 'btn primary', onclick: function () { copy(JSON.stringify(bidBundle), 'Signed Bid JSON'); }, text: 'Copy Signed Bid JSON' }),
            h('button', { class: 'btn', onclick: function () { mintDlg.close(); }, text: 'Done' }))]);
        toast('Bid of ' + C.fmtKas(params.newPrice) + ' KAS created!', 'ok');
        return;
      }

      if (action === 'buy') {
        probe = C.buildBuyEdition({ edition: liveEd, buyer: { pubkey: w.pubkey, address: w.address }, funding: dummyFund, fee: 1n, hrp: A.hrp, editionTemplate: s._editionTemplate });
        var feeBuy = C.estimateFee(probe), priceBuy = BigInt(liveEd.state.price);
        var pickBuy = C.pickFunding(list, priceBuy + feeBuy + 2000000n);
        if (pickBuy.error) throw new Error(pickBuy.error);
        draft = C.buildBuyEdition({ edition: liveEd, buyer: { pubkey: w.pubkey, address: w.address }, funding: pickBuy, fee: feeBuy, hrp: A.hrp, editionTemplate: s._editionTemplate });
        var sb = draft.summary;
        rows = [
          { label: 'Series / Edition', value: s.title + ' #' + ed.index },
          { label: 'Edition serial', value: short(sb.serial, 8, 6), title: sb.serial },
          { label: 'Paid to seller', value: C.fmtKas(sb.ownerNet) + ' KAS' },
          { label: 'Paid to artist (royalty)', value: C.fmtKas(sb.royalty) + ' KAS' },
          { label: 'Network fee (estimate)', value: '≈ ' + C.fmtKas(sb.fee) + ' KAS' },
          { label: 'Leaves your wallet', value: '≈ ' + C.fmtKas(sb.price + sb.fee) + ' KAS', total: true }
        ];
        noteText = 'Buying transfers the 1 KAS edition carrier UTXO to your wallet address and advances the v13 provenance lineage and sales wear.';
      } else if (action === 'list') {
        probe = C.buildListEdition({ edition: liveEd, owner: { pubkey: w.pubkey, address: w.address }, newPrice: params.newPrice, funding: dummyFund, fee: 1n, hrp: A.hrp, editionTemplate: s._editionTemplate });
        var feeList = C.estimateFee(probe);
        var pickList = C.pickFunding(list, feeList + 2000000n);
        if (pickList.error) throw new Error(pickList.error);
        draft = C.buildListEdition({ edition: liveEd, owner: { pubkey: w.pubkey, address: w.address }, newPrice: params.newPrice, funding: pickList, fee: feeList, hrp: A.hrp, editionTemplate: s._editionTemplate });
        rows = [
          { label: 'Series / Edition', value: s.title + ' #' + ed.index },
          { label: 'Action', value: 'List for sale on chain' },
          { label: 'New listing price', value: C.fmtKas(params.newPrice) + ' KAS' },
          { label: 'Artist royalty on sale', value: (Number(liveEd.state.royalty_bips) / 100) + '%' },
          { label: 'Network fee (estimate)', value: '≈ ' + C.fmtKas(draft.fee) + ' KAS', total: true }
        ];
        noteText = 'Your edition stays in its covenant UTXO under your ownership until someone buys it or you cancel the listing.';
      } else if (action === 'unlist') {
        probe = C.buildUnlistEdition({ edition: liveEd, owner: { pubkey: w.pubkey, address: w.address }, funding: dummyFund, fee: 1n, hrp: A.hrp, editionTemplate: s._editionTemplate });
        var feeUn = C.estimateFee(probe);
        var pickUn = C.pickFunding(list, feeUn + 2000000n);
        if (pickUn.error) throw new Error(pickUn.error);
        draft = C.buildUnlistEdition({ edition: liveEd, owner: { pubkey: w.pubkey, address: w.address }, funding: pickUn, fee: feeUn, hrp: A.hrp, editionTemplate: s._editionTemplate });
        rows = [
          { label: 'Series / Edition', value: s.title + ' #' + ed.index },
          { label: 'Action', value: 'Cancel listing (price -> 0)' },
          { label: 'Network fee (estimate)', value: '≈ ' + C.fmtKas(draft.fee) + ' KAS', total: true }
        ];
        noteText = 'Cancelling sets the edition price back to 0 so it cannot be bought.';
      } else if (action === 'transfer') {
        probe = C.buildTransferEdition({ edition: liveEd, owner: { pubkey: w.pubkey, address: w.address }, newOwner: params.newOwner, funding: dummyFund, fee: 1n, hrp: A.hrp, editionTemplate: s._editionTemplate });
        var feeXf = C.estimateFee(probe);
        var pickXf = C.pickFunding(list, feeXf + 2000000n);
        if (pickXf.error) throw new Error(pickXf.error);
        draft = C.buildTransferEdition({ edition: liveEd, owner: { pubkey: w.pubkey, address: w.address }, newOwner: params.newOwner, funding: pickXf, fee: feeXf, hrp: A.hrp, editionTemplate: s._editionTemplate });
        rows = [
          { label: 'Series / Edition', value: s.title + ' #' + ed.index },
          { label: 'Action', value: 'Transfer ownership' },
          { label: 'Recipient', value: short(params.newOwner, 14, 8), title: params.newOwner },
          { label: 'Network fee (estimate)', value: '≈ ' + C.fmtKas(draft.fee) + ' KAS', total: true }
        ];
        noteText = 'Transfers the edition covenant and its 1 KAS carrier to the recipient address.';
      }
      var choice = await askReview('Review ' + action, rows, noteText, draft);
      if (!choice.go) { mintDlg.close(); return; }
      mintScreen(3, 'Approve in Kaspire', h('p', { class: 'note', text: 'Approve the transaction in Kaspire.' }));
      var signIndices = C.walletSignIndices(draft);
      var signed = await K.signPskt(C.toSafeJSON(draft), signIndices);
      mintScreen(4, 'Verifying signed covenant…', h('p', { class: 'note', text: 'Verifying signatures and covenant bindings before broadcast.' }));
      var verified = draft.inputs[0].ownerCovenant ? C.finalizeOwnerCovenantTx(draft, signed) : C.verifySigned(draft, signed);
      var finalSignedJson = verified.signedJson || signed;
      mintScreen(5, 'Broadcasting…', h('p', { class: 'note', text: 'Submitting transaction to the network.' }));
      var res = await K.broadcast(finalSignedJson, verified.rpcTx, { wrpc: choice.wrpc ? [choice.wrpc] : A.wrpc || [] });
      if (!res.txId) {
        mintScreen(5, 'Signed, not broadcast', [
          h('p', { class: 'note warn', text: 'Transaction signed, but could not be broadcast: ' + (res.message || 'no broadcast path') + '. Nothing was spent.' }),
          h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { copy(typeof finalSignedJson === 'string' ? finalSignedJson : JSON.stringify(finalSignedJson), 'Signed transaction'); }, text: 'Copy signed transaction' }), h('button', { class: 'btn ghost', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
        return;
      }
      var link = A.explorer + res.txId;
      mintScreen(6, 'Submitted', [h('p', { class: 'note' }, 'Transaction ', h('a', { href: link, target: '_blank', rel: 'noopener', text: short(res.txId, 10, 8) }), '. Waiting for confirmation…')]);
      var outcome = await pollConfirm(res.txId);
      mintScreen(7, outcome === 'accepted' ? 'Confirmed' : 'Still pending', [
        h('p', { class: outcome === 'accepted' ? 'note' : 'note warn' }, outcome === 'accepted' ? 'Edition state updated on chain. ' : 'Pending confirmation; check ', h('a', { href: link, target: '_blank', rel: 'noopener', text: 'the explorer' }), '.'),
        h('div', { class: 'cta' }, h('button', { class: 'btn primary', onclick: function () { mintDlg.close(); }, text: 'Done' }))]);
      if (outcome === 'accepted') toast('Edition ' + action + ' confirmed!', 'ok');
      if (view && view.reload) view.reload();
    } catch (e) {
      var fe = K.friendly(e);
      if (fe.userCancelled) { mintDlg.close(); toast('Cancelled. Nothing was spent.'); }
      else mintScreen(0, 'Transaction failed', [h('p', { class: 'note bad', text: fe.message }), h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
    } finally { minting = false; }
  }

  /* ------------------------------------------------------------ gallery & portfolio filters */
  var seriesViews = {};
  var STATUS_TXT = { ok: 'Verified in your browser', bad: 'Mismatch: art withheld', wait: 'Verifying…', err: 'Chain unreachable: not fully verified' };

  function renderGalleryFilters() {
    var bar = $('#gallery-filters');
    if (!bar) return;
    clear(bar);
    var w = K.state(), myPk = w.status === 'connected' ? String(w.pubkey).toLowerCase() : '';
    var counts = { all: 0, listed: 0, mine: 0, bids: 0 };
    Object.keys(seriesViews).forEach(function (id) {
      var v = seriesViews[id], s = v.series;
      var liveMap = (v.result && v.result.ctx && v.result.ctx.liveEditions) || {};
      (s.editions || []).forEach(function (ed) {
        counts.all++;
        var st = (liveMap[ed.index] && liveMap[ed.index].state) || { ownerIdentifier: ed.ownerAtMint, price: 0n };
        if (BigInt(st.price || 0) >= SOMPI) counts.listed++;
        if (myPk && String(st.ownerIdentifier || '').toLowerCase() === myPk) counts.mine++;
        if (loadBidsForEdition(ed.covenantId).length > 0) counts.bids++;
      });
    });
    var items = [
      { id: 'all', label: 'All Editions (' + counts.all + ')' },
      { id: 'listed', label: 'Listed for Sale (' + counts.listed + ')' },
      { id: 'mine', label: 'My Collection (' + counts.mine + ')' },
      { id: 'bids', label: 'Active Bids (' + counts.bids + ')' }
    ];
    items.forEach(function (it) {
      bar.appendChild(h('button', {
        class: 'btn' + (activeFilter === it.id ? ' primary' : ''),
        onclick: function () {
          activeFilter = it.id;
          renderGalleryFilters();
          Object.keys(seriesViews).forEach(function (sid) {
            if (seriesViews[sid].refreshEditions) seriesViews[sid].refreshEditions();
          });
        },
        text: it.label
      }));
    });
  }

  function renderSeries(s) {
    var localEds = loadLocalEditions(s.id);
    localEds.forEach(function (le) {
      if (!(s.editions || []).some(function (x) { return x.covenantId === le.covenantId; })) s.editions.push(le);
    });
    var engineSrc = D.engines[s.engine] || s.programHex || s.engineSrc || '';
    if (engineSrc && !D.engines[s.engine]) D.engines[s.engine || s.id] = engineSrc;
    var bnd = bindSeriesTemplates(s, engineSrc);
    var vmMode = bnd.vmMode, engByteCount = bnd.engBytes.length;
    var art = h('div', { class: 'art-wrap' }, h('div', { class: 'veil', text: 'Checking the engine…' }));
    var badge = h('div', { class: 'badge wait' }, h('span', { class: 'dot busy' }), h('span', { text: STATUS_TXT.wait }));
    art.appendChild(badge);
    var meter = h('span', { class: 'meter' }), sum = h('span', { text: 'Proof: 0 of 0 checks' });
    var list = h('ul', { class: 'checks' });
    var proof = h('details', { class: 'proof' }, h('summary', {}, meter, sum), list);
    var facts = { price: h('dd', { text: '…' }), roy: h('dd', { text: '…' }), left: h('dd', { text: '…' }) };
    var cta = h('div', { class: 'cta' }), ctaNote = h('p', { class: 'note' });
    var edHost = h('div', { style: 'margin-top:14px;display:grid;gap:10px' });
    var view = { series: s, lane: null, result: null, artShown: false };

    function previewEdition(edState, indexLabel) {
      runEngine(engineSrc, edState.serial, { series: s, lineage: edState.lineage, sales: edState.sales }).then(function (svg) {
        var oldFr = art.querySelector('iframe');
        if (oldFr) oldFr.remove();
        var v0 = art.querySelector('.veil');
        if (v0) v0.remove();
        art.insertBefore(artFrame(svg), art.firstChild);
        toast('Previewing Edition #' + indexLabel + (edState.sales ? ' (sales: ' + edState.sales + ')' : ''), 'ok');
      }).catch(function (e) { toast('Render failed: ' + e.message, 'bad'); });
    }

    function refreshEditions() {
      clear(edHost);
      var eds = s.editions || [];
      if (!eds.length) {
        edHost.appendChild(h('p', { class: 'note', text: 'No editions minted yet. Mint the first edition above!' }));
        return;
      }
      var w = K.state(), myPk = w.status === 'connected' ? String(w.pubkey).toLowerCase() : '';
      var liveMap = (view.result && view.result.ctx && view.result.ctx.liveEditions) || {};
      var shownCount = 0;
      eds.forEach(function (ed) {
        var live = liveMap[ed.index];
        var st = (live && live.state) || {
          ownerIdentifier: ed.ownerAtMint, price: 0n,
          artist: s.artist, royalty_bips: BigInt(s.royalty_bips || 500),
          serial: ed.serial, lineage: ed.lineage, sales: ed.sales || 0
        };
        var ownerPk = String(st.ownerIdentifier || ed.ownerAtMint || '').toLowerCase();
        var ownerAddr = /^[0-9a-f]{64}$/.test(ownerPk) ? C.p2pkAddress(A.hrp, ownerPk) : ownerPk;
        var isMine = myPk && ownerPk === myPk;
        var price = BigInt(st.price || 0);
        var listed = price >= SOMPI;
        var bids = loadBidsForEdition(ed.covenantId);
        if (activeFilter === 'listed' && !listed) return;
        if (activeFilter === 'mine' && !isMine) return;
        if (activeFilter === 'bids' && !bids.length) return;
        shownCount++;

        var tags = [
          h('span', { class: 'tag ' + (listed ? 'v' : 'd'), text: listed ? 'Listed · ' + C.fmtKas(price) + ' KAS' : 'Unlisted' })
        ];
        if (isMine) tags.push(h('span', { class: 'tag v', style: 'margin-left:6px', text: 'Owned by you' }));
        if (bids.length) tags.push(h('span', { class: 'tag d', style: 'margin-left:6px', text: bids.length + ' Bid(s)' }));
        var metaText = 'Serial ' + short(ed.serial, 8, 6) + ' · Owner ' + short(ownerAddr, 12, 6);
        if (st.lineage !== undefined) {
          var hi = RVM.hostInputs(ReliksBlake2b.blake2b, String(ed.serial), C.hex2u8(st.lineage), Number(st.sales || 0));
          metaText += ' · Sales ' + st.sales + ' · Patina ' + hi.pat + '/63 · Wear ' + hi.wear + '/255';
        }
        var btns = h('div', { class: 'row', style: 'margin-top:8px;flex-wrap:wrap;gap:8px' },
          h('button', { class: 'btn', onclick: function () { previewEdition(st, ed.index); }, text: 'Preview art' }));
        if (listed && !isMine) {
          btns.appendChild(h('button', { class: 'btn primary', onclick: function () { startTrade(s, view, ed, 'buy'); }, text: 'Buy for ' + C.fmtKas(price) + ' KAS' }));
        }
        if (!isMine) {
          btns.appendChild(h('button', { class: 'btn', onclick: function () { startTrade(s, view, ed, 'bid'); }, text: 'Place Bid / Offer' }));
        }
        if (isMine || w.status !== 'connected') {
          btns.appendChild(h('button', { class: 'btn', onclick: function () { startTrade(s, view, ed, 'list'); }, text: listed ? 'Update price' : 'List for sale' }));
          if (listed) btns.appendChild(h('button', { class: 'btn', onclick: function () { startTrade(s, view, ed, 'unlist'); }, text: 'Cancel listing' }));
          btns.appendChild(h('button', { class: 'btn ghost', onclick: function () { startTrade(s, view, ed, 'transfer'); }, text: 'Transfer' }));
        }
        var bidBox = h('div', { style: 'margin-top:8px;display:grid;gap:6px' });
        bids.forEach(function (b) {
          var bAddr = /^[0-9a-f]{64}$/.test(b.bidder) ? C.p2pkAddress(A.hrp, b.bidder) : b.bidder;
          var bRow = h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border-radius:8px;background:rgba(73,197,177,.08)' },
            h('span', { style: 'font:12px var(--mono)', text: 'Bid: ' + C.fmtKas(b.offerPrice) + ' KAS from ' + short(bAddr, 10, 6) }),
            h('div', { class: 'row', style: 'gap:6px' },
              h('button', { class: 'btn primary', style: 'padding:4px 10px;font-size:12px', onclick: function () { startAcceptBid(s, view, ed, b); }, text: 'Accept Bid (' + C.fmtKas(b.offerPrice) + ' KAS)' }),
              h('button', { class: 'btn ghost', style: 'padding:4px 8px;font-size:12px', onclick: function () { copy(JSON.stringify(b), 'Signed Bid JSON'); }, text: 'Copy' }),
              h('button', { class: 'btn ghost', style: 'padding:4px 8px;font-size:12px', onclick: function () { removeBidForEdition(ed.covenantId, b); refreshEditions(); renderGalleryFilters(); }, text: '×' })));
          bidBox.appendChild(bRow);
        });
        edHost.appendChild(h('div', { class: 'card', style: 'padding:14px' },
          h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap' },
            h('b', { text: 'Edition #' + ed.index }),
            h('div', {}, tags)),
          h('p', { class: 'note', style: 'margin:6px 0 0', text: metaText }),
          btns,
          bidBox));
      });
      if (!shownCount) {
        edHost.appendChild(h('p', { class: 'note', text: 'No editions in this series match the active "' + activeFilter + '" filter.' }));
      }
    }
    view.refreshEditions = refreshEditions;

    function refreshCta() {
      clear(cta); ctaNote.className = 'note'; ctaNote.textContent = '';
      var lane = view.lane, w = K.state();
      if (!lane) { cta.appendChild(h('button', { class: 'btn', disabled: true, text: 'Mint' })); ctaNote.textContent = view.laneError ? 'Could not read the lane from the chain: ' + view.laneError : 'Reading the lane…'; if (view.laneError) ctaNote.classList.add('warn'); return; }
      var left = lane.state.mints_left, price = lane.state.price;
      if (left <= 0n) { cta.appendChild(h('button', { class: 'btn', disabled: true, text: 'Primary sold out' })); ctaNote.textContent = 'All primary editions have been minted. You can buy, bid, list, cancel listings, or transfer editions below with Kaspire.'; return; }
      if (view.result && overall(view.result.checks) === 'bad') { cta.appendChild(h('button', { class: 'btn', disabled: true, text: 'Minting disabled' })); ctaNote.textContent = 'Verification failed, so this page will not build a mint for this series.'; ctaNote.classList.add('bad'); return; }
      if (w.status === 'connected') cta.appendChild(h('button', { class: 'btn primary', onclick: function () { startMint(s, view); }, text: 'Mint for ' + C.fmtKas(price) + ' KAS' }));
      else cta.appendChild(h('button', { class: 'btn primary', onclick: openWallet, text: w.status === 'wrongnet' ? 'Switch Kaspire to mainnet' : 'Connect Kaspire to mint' }));
      ctaNote.textContent = C.fmtKas(price) + ' KAS to the artist, plus a 1 KAS carrier that stays in your edition and a network fee of about 0.04 KAS.';
    }
    view.refreshCta = refreshCta;

    function paint(checks) {
      var st = overall(checks);
      clear(meter); checks.forEach(function (c) { meter.appendChild(h('i', { class: c.status === 'ok' ? 'ok' : c.status === 'bad' ? 'bad' : c.status === 'err' ? 'err' : '' })); });
      var okN = checks.filter(function (c) { return c.status === 'ok'; }).length;
      sum.textContent = 'Proof: ' + okN + ' of ' + checks.length + ' checks pass' + (st === 'bad' ? ' (FAILED)' : st === 'wait' ? '' : st === 'err' ? ' (some unreachable)' : '');
      clear(list);
      checks.forEach(function (c) { list.appendChild(h('li', {}, h('span', { class: 'mark ' + c.status, text: c.status === 'ok' ? '✓' : c.status === 'bad' ? '✗' : c.status === 'err' ? '!' : '·' }), h('div', {}, c.label, h('small', { text: c.status === 'wait' ? c.how : (c.detail ? c.detail : c.how) })))); });
      badge.className = 'badge ' + (st === 'ok' ? 'ok' : st === 'bad' ? 'bad' : 'wait');
      clear(badge); badge.appendChild(h('span', { class: 'dot ' + (st === 'ok' ? 'ok' : st === 'bad' ? '' : st === 'wait' ? 'busy' : 'warn') })); badge.appendChild(h('span', { text: STATUS_TXT[st] }));
      if (st === 'bad') { badge.firstChild.style.background = 'var(--red)'; proof.open = true; }
      var local = checks.slice(0, 3).concat(checks.filter(function (c) { return /serial recomputes/.test(c.label); }));
      var localOk = local.every(function (c) { return c.status === 'ok'; });
      if (st === 'bad') { clear(art); art.appendChild(h('div', { class: 'veil', text: 'Art withheld: a verification check failed. Open the proof for details.' })); art.appendChild(badge); view.artShown = false; }
      else if (localOk && !view.artShown) {
        view.artShown = true;
        var ed0 = (s.editions && s.editions[0]) || { serial: '1', lineage: '00'.repeat(32), sales: 0 };
        runEngine(engineSrc, ed0.serial, { series: s, lineage: ed0.lineage, sales: ed0.sales }).then(function (svg) { var fr = artFrame(svg); art.insertBefore(fr, art.firstChild); var v0 = art.querySelector('.veil'); if (v0) v0.remove(); }).catch(function (e) { $('.veil', art).textContent = 'Engine failed: ' + e.message; });
      }
    }

    function applyLane() {
      var lane = view.lane; if (!lane) return;
      facts.price.textContent = C.fmtKas(lane.state.price) + ' KAS'; facts.roy.textContent = (Number(lane.state.royalty_bips) / 100) + '%';
      facts.left.textContent = lane.state.mints_left > 0n ? lane.state.mints_left + ' left' : 'Sold out';
      refreshCta();
    }
    function load() {
      view.lane = null; view.laneError = null; view.artShown = false; refreshCta(); refreshEditions();
      verifySeries(s, engineSrc, function (checks, ctx) { view.result = { checks: checks, ctx: ctx }; if (ctx.lane) { view.lane = ctx.lane; applyLane(); } paint(checks); refreshCta(); refreshEditions(); renderGalleryFilters(); })
        .then(function (r) { if (!r.ctx.lane) { view.laneError = (r.checks.filter(function (c) { return /Live lane/.test(c.label); })[0] || {}).detail; refreshCta(); } refreshEditions(); renderGalleryFilters(); });
    }
    view.reload = load;

    // engine explorer
    var serialIn = h('input', { id: 'ex-serial-' + s.id, inputmode: 'numeric', value: '1', 'aria-label': 'Serial number' });
    var frame = h('div', { class: 'frame' }), exHash = h('pre', { class: 'code', text: '' }), exNote = h('p', { class: 'note', text: '' });
    function explore() {
      var v = serialIn.value.trim();
      if (!/^\d{1,19}$/.test(v)) { exNote.textContent = 'Enter a whole number (a serial).'; return; }
      exNote.textContent = 'Rendering…';
      runEngine(engineSrc, v, { series: s }).then(function (svg) {
        clear(frame); frame.appendChild(artFrame(svg));
        exHash.textContent = 'serial      ' + v + '\nseed        ' + seedOf(v) + '  (serial mod 2^32)\nruntime     ' + (vmMode ? 'Reliks-VM v1 (RVM\\x01)' : 'JavaScript v12') + '\nsvg bytes   ' + svg.length + '\nrender_hash ' + bhex(svg);
        var real = (s.editions || []).filter(function (e) { return String(e.serial) === v; })[0];
        exNote.textContent = real ? 'This serial is edition #' + real.index + ', minted on chain.' : 'Preview only: this serial is not a minted edition. Real serials come from the lane outpoint consumed by each mint.';
      }).catch(function (e) { exNote.textContent = 'Engine error: ' + e.message; });
    }
    var ex = h('details', { class: 'proof', style: 'margin-top:14px' }, h('summary', {}, h('span', { text: 'Engine explorer: the art is just a function of the serial' })),
      h('div', { style: 'padding:4px 18px 18px' },
        h('div', { class: 'explorer' }, frame, h('div', {},
          h('div', { class: 'field' }, h('label', { for: serialIn.id, text: 'Serial' }), serialIn),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: explore, text: 'Render' }), h('button', { class: 'btn', onclick: function () { serialIn.value = String(BigInt(Math.floor(Math.random() * 4294967296))); explore(); }, text: 'Random' }),
            h('button', { class: 'btn ghost', onclick: function () { copy(engineSrc, vmMode ? 'Program hex' : 'Engine source'); }, text: vmMode ? 'Copy program (.hex)' : 'Copy engine' })),
          exNote, exHash))));
    ex.addEventListener('toggle', function () { if (ex.open && !frame.firstChild) explore(); });

    var marketBox = h('details', { class: 'proof', open: true, style: 'margin-top:14px' },
      h('summary', {}, h('span', { text: 'Editions & Secondary Market (' + (s.editions || []).length + ' minted) · List, Buy, Bid, Cancel, Transfer with Kaspire' })),
      h('div', { style: 'padding:4px 18px 18px' }, edHost));

    var el = h('article', { class: 'series', 'aria-label': s.title }, art,
      h('div', { class: 'series-body' },
        h('div', {}, h('span', { class: 'eyebrow', text: vmMode ? 'Mainnet Reliks-VM series (v13)' : 'Mainnet series' }), h('h3', { text: s.title }), h('p', { class: 'tagline', text: 'Deterministic artwork drawn by ' + engByteCount.toLocaleString('en-US') + ' bytes of integer-only ' + (vmMode ? 'Reliks-VM bytecode' : 'code') + ' committed inside the covenant.' })),
        h('dl', { class: 'facts' }, h('div', {}, h('dt', { text: 'Price' }), facts.price), h('div', {}, h('dt', { text: 'Royalty' }), facts.roy), h('div', {}, h('dt', { text: 'Supply' }), facts.left)),
        cta, ctaNote, proof));
    seriesViews[s.id] = view;
    load();
    return h('div', { id: 'series-card-' + s.id, style: 'margin-bottom:28px' }, el, marketBox, ex);
  }

  /* ------------------------------------------------------------ custom series & signed bid loader */
  function initCustomSeriesLoader() {
    var host = $('#custom-series-host');
    if (!host) return;
    var ta = h('textarea', { class: 'editor', style: 'min-height:90px;font-size:12px', spellcheck: 'false', placeholder: 'Paste a Series Anchor JSON (from Studio "Publish on Chain") OR a Signed Bid JSON (reliks_bid: 1) to load it into the Gallery…' });
    var btnLoad = h('button', { class: 'btn', onclick: function () {
      try {
        var obj = JSON.parse(ta.value.trim());
        if (obj && obj.reliks_bid === 1 && obj.editionCovenantId) {
          saveBidForEdition(obj.editionCovenantId, obj);
          Object.keys(seriesViews).forEach(function (sid) { if (seriesViews[sid].refreshEditions) seriesViews[sid].refreshEditions(); });
          renderGalleryFilters();
          ta.value = '';
          toast('Loaded signed bid (' + C.fmtKas(obj.offerPrice) + ' KAS) on Edition #' + obj.editionIndex, 'ok');
          return;
        }
        if (!obj || !obj.laneCovenantId || !obj.programHash) throw new Error('JSON must be a Series Anchor JSON or Signed Bid JSON (reliks_bid: 1).');
        saveCustomSeries(obj);
        mountCustomSeries(obj, true);
        ta.value = '';
        toast('Loaded series: ' + (obj.title || obj.id), 'ok');
      } catch (e) { toast('Invalid JSON: ' + e.message, 'bad'); }
    }, text: 'Import Series or Signed Bid JSON' });
    host.appendChild(h('details', { class: 'proof' },
      h('summary', {}, h('span', { text: 'Import a Newly Published Series Anchor JSON or Signed Bid JSON' })),
      h('div', { style: 'padding:8px 18px 18px;display:grid;gap:10px' }, ta, h('div', { class: 'row' }, btnLoad))));
    loadCustomSeries().forEach(function (cs) { mountCustomSeries(cs, false); });
  }
  function mountCustomSeries(sObj, scrollToIt) {
    var mainHost = $('#series-host');
    if (!mainHost) return;
    var existing = document.getElementById('series-card-' + sObj.id);
    if (existing) existing.remove();
    var card = renderSeries(sObj);
    mainHost.insertBefore(card, mainHost.firstChild);
    renderGalleryFilters();
    if (scrollToIt) card.scrollIntoView({ behavior: 'smooth' });
  }

  /* ------------------------------------------------------------ offline & air-gapped verifier (Provenance Bundle + RVM/JS) */
  function initOfflineVerifier() {
    var host = $('#offline-host');
    if (!host) return;
    var ta = h('textarea', { class: 'editor', id: 'offline-json', style: 'min-height:140px;font-size:12px', spellcheck: 'false', placeholder: 'Paste a Reliks Provenance Bundle JSON (reliks_provenance_bundle: 1) or click one of the built-in bundles below…' });
    var outBox = h('div', { style: 'margin-top:14px;display:grid;gap:14px' });
    var statusLine = h('p', { class: 'note', text: 'Zero network calls: verifies program_hash, anchor render_hash, outpoint serial derivations, P2SH script commitments, and renders every edition in a Web Worker.' });

    async function verifyOffline() {
      clear(outBox);
      var b;
      try { b = JSON.parse(ta.value.trim()); }
      catch (e) { statusLine.textContent = 'Invalid JSON: ' + e.message; return; }
      if (!b || b.reliks_provenance_bundle !== 1 || !b.series || !Array.isArray(b.editions)) {
        statusLine.textContent = 'Expected a Provenance Bundle JSON with reliks_provenance_bundle: 1, series, and editions[].';
        return;
      }
      var s = b.series, vmMode = s.engine_kind === 'vm' || isVmPayload(s.program_hex, s);
      var payload = vmMode ? s.program_hex : s.engine_src;
      var engBytes = engineBytesOf(payload, vmMode);
      var checks = [];
      function addChk(label, ok, detail) { checks.push({ label: label, ok: !!ok, detail: detail || '' }); }

      var gotPh = bhex(engBytes);
      addChk('Program bytes hash to anchored program_hash (' + (vmMode ? 'Reliks-VM' : 'JS') + ', ' + engBytes.length + ' B)', gotPh === s.program_hash, short(gotPh, 16, 8));
      try {
        var svg1 = await runEngine(payload, '1', { kind: vmMode ? 'vm' : 'js', series: s });
        var gotRh = bhex(svg1);
        addChk('Anchor render(serial=1) matches render_hash', gotRh === s.render_hash, short(gotRh, 16, 8));
      } catch (e) {
        addChk('Anchor render(serial=1) matches render_hash', false, e.message);
      }

      var edTpl = (b.templates && b.templates.edition) || (s.protocol_version === 'v13' && D.templatesV13 ? D.templatesV13.edition : D.templates.edition);
      var edCards = [];
      for (var i = 0; i < b.editions.length; i++) {
        var ed = b.editions[i];
        var opParts = String(ed.consumedLaneOutpoint || '').split(':');
        var serOk = C.serialFromOutpoint(opParts[0], Number(opParts[1] || 0)) === String(ed.serial);
        addChk('Edition #' + ed.index + ': serial recomputes from ' + short(ed.consumedLaneOutpoint, 10, 4), serOk, 'serial ' + ed.serial);
        var spkGot = C.p2shSpk(C.editionRedeem(ed.state, edTpl));
        var spkOk = spkGot === ed.expectedSpk;
        addChk('Edition #' + ed.index + ': P2SH scriptPubKey recomputes from state', spkOk, short(spkGot, 14, 6));
        try {
          var svgEd = await runEngine(payload, ed.serial, { kind: vmMode ? 'vm' : 'js', lineage: ed.state.lineage, sales: ed.state.sales });
          var rhEd = bhex(svgEd);
          var rhOk = rhEd === ed.render_hash;
          addChk('Edition #' + ed.index + ': artwork render_hash matches bundle (' + svgEd.length + ' B)', rhOk, short(rhEd, 16, 8));
          if (serOk && spkOk && rhOk) {
            edCards.push(h('div', { class: 'card' },
              h('span', { class: 'tag v', text: 'Offline verified · Ed #' + ed.index }),
              h('h3', { text: s.title + ' · serial ' + short(ed.serial, 8, 6) }),
              h('p', { text: (vmMode ? 'Reliks-VM · sales ' + ed.state.sales + ' · wear ' + (ed.wear || 0) + ' · patina ' + (ed.pat || 0) : 'JavaScript v12') + ' · spk ' + short(spkGot, 12, 6) }),
              h('div', { class: 'art-wrap', style: 'margin-top:10px;border-radius:10px;overflow:hidden' }, artFrame(svgEd))));
          }
        } catch (e) {
          addChk('Edition #' + ed.index + ': artwork render', false, e.message);
        }
      }

      var allOk = checks.every(function (c) { return c.ok; });
      statusLine.textContent = allOk
        ? 'OFFLINE VERIFIED: ' + checks.length + ' of ' + checks.length + ' checks passed with zero network calls.'
        : 'OFFLINE VERIFICATION FAILED: art withheld for failing editions.';
      var ul = h('ul', { class: 'checks' });
      checks.forEach(function (c) {
        ul.appendChild(h('li', {}, h('span', { class: 'mark ' + (c.ok ? 'ok' : 'bad'), text: c.ok ? '✓' : '✗' }), h('div', {}, c.label, h('small', { text: c.detail }))));
      });
      outBox.appendChild(h('details', { class: 'proof', open: true }, h('summary', {}, h('span', { text: 'Offline Proof: ' + checks.filter(function (c) { return c.ok; }).length + ' of ' + checks.length + ' checks pass' })), ul));
      if (edCards.length) outBox.appendChild(h('div', { class: 'cards' }, edCards));
    }

    var btns = h('div', { class: 'row', style: 'margin:10px 0' },
      h('button', { class: 'btn primary', id: 'btn-verify-offline', onclick: verifyOffline, text: 'Verify & Render Offline' }));
    if (D.bundles && D.bundles.v12) {
      btns.appendChild(h('button', { class: 'btn', onclick: function () { ta.value = JSON.stringify(D.bundles.v12, null, 2); verifyOffline(); }, text: 'Load v12 Mainnet Bundle (JS)' }));
    }
    if (D.bundles && D.bundles.v13) {
      btns.appendChild(h('button', { class: 'btn', onclick: function () { ta.value = JSON.stringify(D.bundles.v13, null, 2); verifyOffline(); }, text: 'Load v13 Demo Bundle (Reliks-VM)' }));
    }
    host.appendChild(h('div', { class: 'card', style: 'padding:18px' }, statusLine, ta, btns, outBox));
  }

  /* ------------------------------------------------------------ studio (Reliks-VM v13 default + High-Level DSL + 1-click Publish) */
  function initStudio() {
    var ed = $('#ed'), ser = $('#ser'), lin = $('#lin'), wr = $('#wr'), wv = $('#wv'), wearOn = $('#wear-on'), gatesEl = $('#gates-out'), stat = $('#studio-status'), hashes = $('#hashes'), prevBox = $('#prev-box'), tpl = $('#tpl');
    var vmCtrl = $('#vm-controls'), vmWear = $('#vm-wear-row'), exeBtn = $('#exe'), exsrcBtn = $('#exsrc'), pubBtn = $('#pub-kaspire'), pubOut = $('#pub-out');
    var CAP = D.studio.cap, PRELUDE = D.studio.prelude, B = ReliksBlake2b.blake2b;
    var BANNED = [[/\bMath\s*\.\s*(random|sin|cos|tan|asin|acos|atan2?|pow|sqrt|hypot|exp|log2?|log10)\b/, 'Math transcendental/random'], [/\bDate\b/, 'Date'], [/\bperformance\b/, 'performance'], [/\bfetch\s*\(/, 'fetch'], [/\bXMLHttpRequest\b/, 'XHR'], [/\bWebSocket\b/, 'WebSocket'], [/\brequire\s*\(/, 'require'], [/\bimport\s*[\(\{]/, 'import'], [/\beval\s*\(/, 'eval'], [/new\s+Function/, 'new Function'], [/\bwindow\b/, 'window'], [/\bdocument\b/, 'document'], [/\blocalStorage\b/, 'localStorage'], [/\bsetTimeout\b|\bsetInterval\b/, 'timer'], [/\bprocess\b/, 'process'], [/\bglobalThis\b/, 'globalThis']];
    var lastProg = null, timer = 0;

    function isJsSource(raw) { return /\bfunction\s+reliks\s*\(/.test(raw); }
    function applyWearToggle(src, enabled) {
      if (/wear\s+push\s+[01]\s+mul\s+st\s+WR/.test(src)) {
        return src.replace(/wear\s+push\s+[01]\s+mul\s+st\s+WR/, 'wear push ' + (enabled ? '1' : '0') + ' mul st WR');
      }
      return src;
    }
    function parseVmSourceOrHex(raw) {
      var trimmed = String(raw || '').trim(), compact = trimmed.replace(/\s+/g, '');
      if (compact.length >= 18 && compact.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(compact) && /^52564d01/i.test(compact)) {
        return C.hex2u8(compact.toLowerCase());
      }
      var src = (wearOn && !wearOn.checked) ? applyWearToggle(raw, false).replace(/\bwear\b(?!\s+push\s+0\s+mul)/g, 'push 0') : raw;
      return RvmAsm.assemble(src);
    }
    function src() { return PRELUDE + '\n' + ed.value; }
    function blen(x) { return C.utf8(x).length; }
    function syncUiMode(vmMode) {
      if (vmCtrl) vmCtrl.style.display = vmMode ? '' : 'none';
      if (vmWear) vmWear.style.display = vmMode ? '' : 'none';
      if (exeBtn) exeBtn.textContent = vmMode ? 'Export bytecode (.hex)' : 'Export engine (.js)';
      if (exsrcBtn) exsrcBtn.style.display = vmMode ? '' : 'none';
    }

    async function gates() {
      var raw = ed.value;
      if (!isJsSource(raw)) {
        syncUiMode(true);
        var out = [], ok = true;
        function chkVm(name, pass, info) { out.push({ pass: pass, text: name + (info ? '  ' + info : '') }); if (!pass) ok = false; }
        var prog = null;
        try { prog = parseVmSourceOrHex(raw); lastProg = prog; }
        catch (e) {
          lastProg = null;
          chkVm('V0 assemble', false, e.message);
          clear(gatesEl); out.forEach(function (o) { gatesEl.appendChild(h('div', {}, h('span', { class: o.pass ? 'p' : 'f', text: o.pass ? 'PASS ' : 'FAIL ' }), o.text)); });
          stat.textContent = 'Assemble error: ' + e.message;
          return false;
        }
        chkVm('V1 size <= PUSHDATA2 baking cap', prog.length <= CAP, prog.length + ' / ' + CAP + ' B');
        var anchorOk = false, anchorHash = '';
        try {
          var hi1 = RVM.hostInputs(B, '1', new Uint8Array(32), 0);
          var svg1 = RVM.render(prog, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
          anchorHash = bhex(svg1).slice(0, 16) + '…';
          anchorOk = svg1.indexOf('<svg') === 0 && /<\/svg>$/.test(svg1);
        } catch (e) { anchorHash = e.code || e.message; }
        chkVm('V2 anchor render (serial=1, lineage=0, sales=0)', anchorOk, anchorHash);
        var detOk = true;
        try {
          var hiD = RVM.hostInputs(B, '42', new Uint8Array(32), 0);
          var a1 = RVM.render(prog, hiD.lanes, hiD.serial32, hiD.pat, hiD.wear);
          var a2 = RVM.render(prog, hiD.lanes, hiD.serial32, hiD.pat, hiD.wear);
          detOk = a1 === a2;
        } catch (e) { detOk = false; }
        chkVm('V3 determinism (double-render serial 42)', detOk);
        var sers = ['1', '42', '999', '8675309', '4294967295', '9223372036854775807'];
        var corners = [[0, 0], [0, 255], [21, 128], [63, 0], [63, 255]];
        var maxFuel = 0, maxElems = 0, maxSvg = 0, maxSt = 0, faults = 0, firstFault = '';
        for (var si = 0; si < sers.length; si++) {
          var hiS = RVM.hostInputs(B, sers[si], new Uint8Array(32), 0);
          for (var ci = 0; ci < corners.length; ci++) {
            var stObj = {};
            try {
              RVM.render(prog, hiS.lanes, hiS.serial32, corners[ci][0], corners[ci][1], stObj);
              if (stObj.fuel > maxFuel) maxFuel = stObj.fuel;
              if (stObj.elems > maxElems) maxElems = stObj.elems;
              if (stObj.svg_len > maxSvg) maxSvg = stObj.svg_len;
              if (stObj.max_stack > maxSt) maxSt = stObj.max_stack;
            } catch (e) {
              faults++;
              if (!firstFault) firstFault = 'serial ' + sers[si] + ' pat ' + corners[ci][0] + ' wear ' + corners[ci][1] + ': ' + (e.code || e.message);
            }
          }
        }
        chkVm('V4 corner sweep (30 renders across serials x pat/wear)', faults === 0, faults ? firstFault : '0 faults');
        chkVm('V5 worst-case headroom', faults === 0, 'fuel ' + maxFuel + '/' + RVM.limits.FUEL_MAX + ' | elems ' + maxElems + '/' + RVM.limits.MAX_ELEMS + ' | svg ' + maxSvg + '/' + RVM.limits.MAX_SVG + ' B | stack ' + maxSt + '/' + RVM.limits.STACK_MAX);
        clear(gatesEl); out.forEach(function (o) { gatesEl.appendChild(h('div', {}, h('span', { class: o.pass ? 'p' : 'f', text: o.pass ? 'PASS ' : 'FAIL ' }), o.text)); });
        stat.textContent = ok ? 'All Reliks-VM gates green: ready to publish on chain or export .hex bytecode.' : 'VM gates failed: see report above.';
        return ok;
      }

      syncUiMode(false);
      var s = src(), outJs = [], okJs = true;
      function chk(name, pass, info) { outJs.push({ pass: pass, text: name + (info ? '  ' + info : '') }); if (!pass) okJs = false; }
      chk('L1 size within cap', blen(s) <= CAP, blen(s) + ' / ' + CAP + ' B (prelude ' + PRELUDE.length + ' B included)');
      var bad = BANNED.filter(function (b) { return b[0].test(s); }).map(function (b) { return b[1]; });
      chk('L2 no banned constructs', bad.length === 0, bad.join(', '));
      var a = null, b2 = null, c = null, err = '';
      try { a = await runEngine(s, '42'); b2 = await runEngine(s, '42'); c = await runEngine(s, '42'); } catch (e) { err = e.message; }
      chk('L3 deterministic x3', !err && a === b2 && b2 === c, err);
      var good = false; try { good = !!a && a.indexOf('<svg') === 0 && a.indexOf('xmlns=') > -1 && a.slice(-6) === '</svg>' && !/NaN|undefined|Infinity|null/.test(a); } catch (e) { good = false; }
      chk('L8 svg well-formed', good);
      var conv = false; try { conv = (await runEngine(s, '7')) === (await runEngine(s, '4294967303')); } catch (e) { conv = false; }
      chk('L5 seed = serial mod 2^32', conv);
      clear(gatesEl); outJs.forEach(function (o) { gatesEl.appendChild(h('div', {}, h('span', { class: o.pass ? 'p' : 'f', text: o.pass ? 'PASS ' : 'FAIL ' }), o.text)); });
      stat.textContent = okJs ? 'Gates green: ready to publish or export.' : 'Gates failed: fix these before publishing.';
      return okJs;
    }

    async function show() {
      var v = ser.value.trim() || '1';
      var wEnabled = !wearOn || wearOn.checked;
      if (wv && wr) wv.textContent = wEnabled ? wr.value : '0 (off)';
      if (wr) wr.disabled = !wEnabled;
      if (!/^\d{1,19}$/.test(v) || BigInt(v) >= BigInt('9223372036854775808')) { stat.textContent = 'Serial must be a whole number below 2^63.'; return; }
      var raw = ed.value;
      if (!isJsSource(raw)) {
        syncUiMode(true);
        var l = (lin && lin.value ? lin.value.trim().toLowerCase() : '0'.repeat(64));
        if (!/^[0-9a-f]{64}$/.test(l)) { stat.textContent = 'Lineage must be 64 hex characters.'; return; }
        var prog;
        try { prog = parseVmSourceOrHex(raw); lastProg = prog; }
        catch (e) { lastProg = null; stat.textContent = 'Assemble error: ' + e.message; return; }
        try {
          var hi = RVM.hostInputs(B, v, C.hex2u8(l), wEnabled ? Number((wr && wr.value) || 0) : 0), stats = {};
          var svgVm = RVM.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear, stats);
          clear(prevBox); prevBox.appendChild(artImg(svgVm));
          hashes.textContent = 'program       ' + prog.length + ' / ' + CAP + ' B (PUSHDATA2 bake cap)\nprogram_hash  ' + bhex(prog) + '\nrender_hash   ' + bhex(svgVm) + '\nsvg           ' + svgVm.length + ' / ' + RVM.limits.MAX_SVG + ' B\nfuel          ' + stats.fuel + ' / ' + RVM.limits.FUEL_MAX + '\nelements      ' + stats.elems + ' / ' + RVM.limits.MAX_ELEMS + '\nmax_stack     ' + stats.max_stack + ' / ' + RVM.limits.STACK_MAX + '\nwear          ' + hi.wear + ' / 255' + (wEnabled ? '' : ' (disabled in bytecode)') + '\npatina        ' + hi.pat + ' / 63';
          stat.textContent = 'Rendered Reliks-VM program (' + prog.length + ' B). Click "Publish on Chain (Kaspire)" to deploy.';
        } catch (e) {
          stat.textContent = 'Render fault: ' + (e.code || e.message);
        }
        return;
      }

      syncUiMode(false);
      var svg; try { svg = await runEngine(src(), v); } catch (e) { stat.textContent = 'Error: ' + e.message; return; }
      clear(prevBox); prevBox.appendChild(artImg(svg));
      hashes.textContent = 'engine_hash ' + bhex(src()) + '\nrender_hash ' + bhex(svg) + '\nengine_bytes ' + blen(src()) + ' / ' + CAP;
      await gates();
    }

    function download(fn, text) { var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: fn }); document.body.appendChild(a); a.click(); a.remove(); }
    function slug() { return ($('#name').value || 'my-program').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'my-program'; }

    function readSeriesForm(requireConnectedWallet) {
      var w = K.state();
      if (requireConnectedWallet && w.status !== 'connected') { openWallet(); return null; }
      var rawArtist = $('#artist').value.trim();
      var artistPk = '';
      if (rawArtist) {
        try { artistPk = C.parseOwnerInput(A.hrp, rawArtist).pubkey; } catch (e) { toast(e.message, 'bad'); stat.textContent = e.message; return null; }
      } else if (w.status === 'connected') {
        artistPk = w.pubkey;
      }
      var priceStr = $('#price').value.trim(), roy = Number($('#roy').value), n = Number($('#eds').value), err = '';
      var priceSompi; try { priceSompi = priceStr === '' ? -1n : BigInt(Math.round(Number(priceStr) * 1e8)); } catch (e) { priceSompi = -1n; }
      if (!/^[0-9a-f]{64}$/.test(artistPk)) err = 'Artist key must be 64 hex characters or a kaspa: address (connect Kaspire to fill it automatically).';
      else if (requireConnectedWallet && artistPk !== w.pubkey) err = 'To publish with Kaspire, the artist key must match the connected Kaspire wallet (or leave Artist blank).';
      else if (priceSompi !== 0n && !(priceSompi >= SOMPI)) err = 'Price must be 0 or at least 1 KAS.';
      else if (!(roy >= 0.01 && roy <= 20)) err = 'Royalty must be between 0.01% and 20%.';
      else if (!(Number.isInteger(n) && n >= 1)) err = 'Editions must be a whole number of at least 1.';
      if (err) { stat.textContent = err; toast(err, 'bad'); return null; }
      return { artist: artistPk, priceSompi: priceSompi, royaltyBips: Math.round(roy * 100), supply: n };
    }

    async function publishWithKaspire() {
      if (minting) return;
      if (!(await gates())) { toast('Fix the failing gates before publishing.', 'bad'); return; }
      var form = readSeriesForm(true);
      if (!form) return;
      var w = K.state();
      var vmMode = !isJsSource(ed.value);
      var progBytes = vmMode ? lastProg : C.utf8(src());
      var progHash = bhex(progBytes);
      var svg1 = await runEngine(vmMode ? C.u8hex(progBytes) : src(), '1', { kind: vmMode ? 'vm' : 'js' });
      var renHash = bhex(svg1);
      var edTpl = vmMode && D.templatesV13 ? D.templatesV13.edition : D.templates.edition;
      var depState = {
        program_hash: progHash, artist: w.pubkey, price: form.priceSompi,
        royalty_bips: BigInt(form.royaltyBips), mints_left: BigInt(form.supply),
        engine_lang: vmMode ? 2n : 1n, render_hash: renHash
      };
      minting = true;
      try {
        mintScreen(1, 'Building SeriesFactory genesis…', h('p', { class: 'note', text: 'Synthesizing the SeriesFactory-' + (vmMode ? 'v13' : 'v12') + ' covenant script and selecting wallet UTXO(s).' }));
        var list = await io.utxos(w.address);
        var probe = C.buildDeploySeries({ state: depState, progBytes: progBytes, editionTemplate: edTpl, artist: { pubkey: w.pubkey, address: w.address }, funding: { txId: '00'.repeat(32), index: 0, amount: 10n ** 13n }, fee: 1n, hrp: A.hrp });
        var fee = C.estimateFee(probe);
        var pick = C.pickFunding(list, C.CARRIER + fee + 2000000n);
        if (pick.error) throw new Error(pick.error);
        var draft = C.buildDeploySeries({ state: depState, progBytes: progBytes, editionTemplate: edTpl, artist: { pubkey: w.pubkey, address: w.address }, funding: pick, fee: fee, hrp: A.hrp });
        var ds = draft.summary;
        var choice = await askReview('Review Series Deployment', [
          { label: 'Series title', value: $('#name').value.trim() || slug() },
          { label: 'Protocol / Runtime', value: vmMode ? 'Reliks v13 (Reliks-VM)' : 'Reliks v12 (JS)' },
          { label: 'Program size / hash', value: progBytes.length + ' B · ' + short(progHash, 10, 6), title: progHash },
          { label: 'Anchor render_hash (serial 1)', value: short(renHash, 10, 6), title: renHash },
          { label: 'Supply / Mint price / Royalty', value: form.supply + ' eds · ' + C.fmtKas(form.priceSompi) + ' KAS · ' + (form.royaltyBips / 100) + '%' },
          { label: 'Lane covenant ID (KIP-20)', value: short(ds.laneCovenantId, 12, 8), title: ds.laneCovenantId },
          { label: 'Locked in lane carrier', value: C.fmtKas(ds.carrier) + ' KAS' },
          { label: 'Network fee (estimate)', value: '≈ ' + C.fmtKas(ds.fee) + ' KAS' },
          { label: 'Leaves your wallet', value: '≈ ' + C.fmtKas(ds.carrier + ds.fee) + ' KAS', total: true }
        ], 'This deploys your immutable SeriesFactory covenant on Kaspa. Once confirmed, anyone can mint editions directly from it.', draft);
        if (!choice.go) { mintDlg.close(); return; }
        mintScreen(3, 'Approve in Kaspire', h('p', { class: 'note', text: 'Approve the genesis transaction in Kaspire.' }));
        var signed = await K.signPskt(C.toSafeJSON(draft), C.walletSignIndices(draft));
        mintScreen(4, 'Verifying signed genesis…', h('p', { class: 'note', text: 'Checking signature and KIP-20 lane covenant binding.' }));
        var v = C.verifySigned(draft, signed);
        mintScreen(5, 'Broadcasting…', h('p', { class: 'note', text: 'Submitting SeriesFactory genesis transaction.' }));
        var res = await K.broadcast(signed, v.rpcTx, { wrpc: choice.wrpc ? [choice.wrpc] : A.wrpc || [] });
        if (!res.txId) {
          mintScreen(5, 'Signed, not broadcast', [
            h('p', { class: 'note warn', text: 'Kaspire signed the genesis transaction, but it could not be broadcast: ' + (res.message || 'no broadcast path') + '. Nothing was spent.' }),
            h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { copy(typeof signed === 'string' ? signed : JSON.stringify(signed), 'Signed genesis transaction'); }, text: 'Copy signed transaction' }), h('button', { class: 'btn ghost', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
          return;
        }
        var seriesAnchor = {
          id: slug() + '-' + res.txId.slice(0, 6),
          title: $('#name').value.trim() || slug(),
          protocol_version: vmMode ? 'v13' : 'v12',
          laneCovenantId: ds.laneCovenantId,
          genesisTxId: res.txId,
          programHash: progHash,
          renderHash: renHash,
          artist: w.pubkey,
          engine_lang: vmMode ? 2 : 1,
          engineKind: vmMode ? 'vm' : 'js',
          programHex: vmMode ? C.u8hex(progBytes) : undefined,
          engineSrc: vmMode ? undefined : src(),
          royalty_bips: form.royaltyBips,
          genesisState: {
            program_hash: progHash, artist: w.pubkey, price: form.priceSompi.toString(),
            royalty_bips: String(form.royaltyBips), mints_left: String(form.supply),
            engine_lang: vmMode ? '2' : '1', render_hash: renHash
          },
          editions: []
        };
        saveCustomSeries(seriesAnchor);
        mountCustomSeries(seriesAnchor, false);
        if (pubOut) {
          clear(pubOut);
          pubOut.appendChild(h('div', { class: 'review', style: 'margin-top:8px' },
            h('div', {}, h('span', { text: 'Genesis TxID' }), h('b', { text: short(res.txId, 12, 8), title: res.txId })),
            h('div', {}, h('span', { text: 'Lane Covenant ID' }), h('b', { text: short(ds.laneCovenantId, 12, 8), title: ds.laneCovenantId })),
            h('div', { class: 'row', style: 'margin-top:8px;flex-wrap:wrap' },
              h('button', { class: 'btn primary', onclick: function () { showTab('gallery'); var el = document.getElementById('series-card-' + seriesAnchor.id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, text: 'Open in Gallery & Mint' }),
              h('button', { class: 'btn', onclick: function () { copy(JSON.stringify(seriesAnchor, null, 2), 'Series Anchor JSON'); }, text: 'Copy Anchor JSON' }),
              h('button', { class: 'btn ghost', onclick: function () { download('anchor-' + seriesAnchor.id + '.json', JSON.stringify(seriesAnchor, null, 2) + '\n'); }, text: 'Download Anchor (.json)' }),
              h('button', { class: 'btn', onclick: function () { copy(JSON.stringify(seriesAnchor, null, 2), 'Anchor JSON'); window.open('https://github.com/weirdtualguy/Reliks/issues/new?template=submit-series.yml&title=' + encodeURIComponent('[Series] ' + seriesAnchor.title), '_blank', 'noopener'); }, text: 'Submit to Marketplace (GitHub)' }))));
        }
        var link = A.explorer + res.txId;
        mintScreen(6, 'Published!', [
          h('p', { class: 'note' }, 'SeriesFactory deployed in transaction ', h('a', { href: link, target: '_blank', rel: 'noopener', text: short(res.txId, 10, 8) }), '. Your series has been added to the Gallery tab.'),
          h('div', { class: 'cta' },
            h('button', { class: 'btn primary', onclick: function () { mintDlg.close(); showTab('gallery'); }, text: 'View in Gallery' }),
            h('button', { class: 'btn', onclick: function () { copy(JSON.stringify(seriesAnchor, null, 2), 'Series Anchor JSON'); }, text: 'Copy Anchor JSON' }))]);
        toast('Series published on chain!', 'ok');
      } catch (e) {
        var fe = K.friendly(e);
        if (fe.userCancelled) { mintDlg.close(); toast('Cancelled. Nothing was spent.'); }
        else mintScreen(0, 'Could not publish series', [h('p', { class: 'note bad', text: fe.message }), h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
      } finally { minting = false; }
    }

    if (pubBtn) pubBtn.addEventListener('click', publishWithKaspire);
    $('#exe').addEventListener('click', async function () {
      if (!(await gates())) { toast('Fix the failing gates before exporting.', 'bad'); return; }
      var name = slug();
      if (!isJsSource(ed.value)) {
        if (!lastProg) return;
        download(name + '.hex', C.u8hex(lastProg) + '\n');
        stat.textContent = 'Exported ' + name + '.hex. Next: node cli/reliks-lens-vm.js ' + name + '.hex';
        return;
      }
      download(name + '.js', ["const { blake2b: b2 } = require('./web/blake2b.js');", "const blake2b = (m, o) => b2(m, (o && o.dkLen) || 32);", "const B = Buffer;", 'const ENGINE_SRC = ' + JSON.stringify(src()) + ';', 'const TEST_SERIAL = 1;',
        "function seedLanes(serial){const le=B.alloc(8);le.writeBigUInt64LE(BigInt(serial));const h=blake2b(B.concat([B.from('ReliksSeedV10','utf8'),le]),{dkLen:32});const dv=new DataView(h.buffer,h.byteOffset,h.byteLength);const lanes=[];for(let i=0;i<8;i++)lanes.push(dv.getInt32(i*4,true));return lanes;}",
        "const compiled=new Function('L','serial',ENGINE_SRC+'\\nreturn reliks(L,serial);');", 'function render(serial){const s=Number(BigInt(serial)&0xFFFFFFFFn);return compiled(seedLanes(s),s|0);}',
        "const engineHashHex=B.from(blake2b(B.from(ENGINE_SRC,'utf8'),{dkLen:32})).toString('hex');", "const renderHashHex=B.from(blake2b(B.from(render(TEST_SERIAL),'utf8'),{dkLen:32})).toString('hex');", 'module.exports={ENGINE_SRC,seedLanes,render,engineHashHex,renderHashHex,TEST_SERIAL};'].join('\n') + '\n');
      stat.textContent = 'Exported ' + name + '.js. Next: node cli/reliks-lens.js ' + name + '.js';
    });
    if (exsrcBtn) {
      exsrcBtn.addEventListener('click', function () {
        download(slug() + '.rvm.txt', ed.value);
      });
    }
    $('#exs').addEventListener('click', function () {
      var form = readSeriesForm(false);
      if (!form) return;
      var seriesObj = { artist: form.artist, price: Number(form.priceSompi), royalty_bips: form.royaltyBips, mints_left: form.supply, engine_lang: isJsSource(ed.value) ? 1 : 2 };
      download('series-' + slug() + '.json', JSON.stringify(seriesObj, null, 2) + '\n');
      stat.textContent = 'Exported series-' + slug() + '.json';
    });
    $('#load').addEventListener('click', function () { ed.value = D.studio.templates[tpl.value] || D.studio.templates.iso; if (wearOn) ed.value = applyWearToggle(ed.value, wearOn.checked); clear(gatesEl); show(); });
    $('#go').addEventListener('click', show);
    $('#rnd').addEventListener('click', function () { ser.value = String(Math.floor(Math.random() * 4294967296)); show(); });
    if ($('#rnd-lin')) $('#rnd-lin').addEventListener('click', function () { var o = new Uint8Array(32); crypto.getRandomValues(o); lin.value = C.u8hex(o); show(); });
    if (lin) lin.addEventListener('change', show);
    if (wr) wr.addEventListener('input', show);
    if (wearOn) wearOn.addEventListener('change', function () { ed.value = applyWearToggle(ed.value, wearOn.checked); show(); });
    ed.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(show, 600); });
    $('#run-gates').addEventListener('click', gates);
    K.on(function (st) { var a = $('#artist'); if (st.status === 'connected' && !a.value) a.placeholder = 'from Kaspire: ' + short(st.pubkey, 10, 6); });
    ed.value = D.studio.templates.iso || D.studio.templates.dagcity;
    return { show: show };
  }

  /* ------------------------------------------------------------ tabs */
  var studio = null;
  function showTab(name) {
    if (['gallery', 'studio', 'protocol'].indexOf(name) < 0) name = 'gallery';
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    if (name === 'studio' && !studio) { studio = initStudio(); studio.show(); }
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('nav.tabs button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
  window.addEventListener('hashchange', function () { showTab(location.hash.slice(1)); });

  // Boot
  var host = $('#series-host');
  A.series.forEach(function (s) { host.appendChild(renderSeries(s)); });
  initCustomSeriesLoader();
  renderGalleryFilters();
  initOfflineVerifier();
  walletChip();
  K.restore().then(walletChip);
  showTab(location.hash.slice(1) || 'gallery');
  window.__reliks = { C: C, K: K, RVM: RVM, RvmAsm: RvmAsm, verifySeries: verifySeries, runEngine: runEngine, views: seriesViews };
})();
