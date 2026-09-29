/* Reliks site application. Runs inside docs/index.html (see gen-site.js).
   Everything on the page is recomputed here in the visitor's browser: engine hash,
   image hash, serials, contract scripts and covenant ids are compared with public
   chain data, and the art is withheld if any comparison fails.

   Globals provided by the page: RELIKS_DATA, ReliksBlake2b, ReliksChain, Kaspire. */
(function () {
  'use strict';
  var D = window.RELIKS_DATA, C = window.ReliksChain.init(D.templates), K = window.Kaspire.create();
  var A = D.anchors, SOMPI = C.SOMPI;
  var io = C.makeIO(A);
  var $ = function (s, r) { return (r || document).querySelector(s); };

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
  function cat(list) { var n = 0, i; list.forEach(function (x) { n += x.length; }); var o = new Uint8Array(n), p = 0; list.forEach(function (x) { o.set(x, p); p += x.length; }); return o; }
  function bhex(s) { return C.u8hex(ReliksBlake2b.blake2b(C.utf8(s), 32)); }

  /* ------------------------------------------------------------ deterministic engine runner (worker, 5 s cap) */
  function seedLanes(seed) {
    var le = new Uint8Array(8); new DataView(le.buffer).setBigUint64(0, BigInt(seed), true);
    var hh = ReliksBlake2b.blake2b(cat([C.utf8('ReliksSeedV10'), le]), 32), dv = new DataView(hh.buffer, hh.byteOffset, hh.byteLength), out = [];
    for (var i = 0; i < 8; i++) out.push(dv.getInt32(i * 4, true));
    return out;
  }
  function seedOf(serial) { return Number(BigInt(serial) & 0xFFFFFFFFn); }
  var WORKER_SRC = 'self.onmessage=function(e){try{var fn=new Function("L","serial",e.data.engine+"\\nreturn reliks(L,serial);");self.postMessage({svg:fn(e.data.lanes,e.data.serial)});}catch(x){self.postMessage({error:String(x&&x.message||x)});}};';
  function runEngine(src, serial) {
    return new Promise(function (resolve, reject) {
      var s = seedOf(serial), url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })), w;
      try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); return reject(e); }
      var t = setTimeout(function () { w.terminate(); URL.revokeObjectURL(url); reject(new Error('Engine timed out (5 s). Possible infinite loop.')); }, 5000);
      w.onmessage = function (e) { clearTimeout(t); w.terminate(); URL.revokeObjectURL(url); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.svg); };
      w.onerror = function (e) { clearTimeout(t); w.terminate(); URL.revokeObjectURL(url); reject(new Error(e.message || 'engine error')); };
      w.postMessage({ engine: src, lanes: seedLanes(s), serial: s | 0 });
    });
  }
  function frameDoc(svg, bg) {
    return '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:' + (bg || '#e7dfc8') + '}svg{display:block;width:100%;height:100%}</style>' + svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ');
  }
  function artFrame(svg, bg) { return h('iframe', { sandbox: '', title: 'Generative artwork', srcdoc: frameDoc(svg, bg), loading: 'lazy' }); }

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

  async function verifySeries(s, engineSrc, onUpdate) {
    var checks = [], ctx = { lane: null, editionOk: {} };
    function push(c) { checks.push(c); return c; }
    var cHash = push(newCheck('Engine bytes hash to the anchored program_hash', 'BLAKE2b-256 of the ' + new Blob([engineSrc]).size + ' engine bytes shipped with this page'));
    var cRender = push(newCheck('Engine reproduces the anchored image', 'BLAKE2b-256 of render(serial 1) compared with render_hash'));
    var cBaked = push(newCheck('Engine is baked into the factory contract template', 'engine bytes found inside the compiled SeriesFactory-v12 template'));
    var cLane = push(newCheck('Live lane covenant commits to this engine', 'lane state decoded from public chain data must recompute to the on-chain script'));
    var eds = s.editions.map(function (ed) {
      return { ed: ed, serial: push(newCheck('Edition #' + ed.index + ': serial recomputes from its lane outpoint', 'ReliksSerialV10 over the consumed lane outpoint')),
        spk: push(newCheck('Edition #' + ed.index + ': contract script matches the mint transaction', 'script rebuilt from claimed state, compared with the mint output')),
        cov: push(newCheck('Edition #' + ed.index + ': covenant id recomputes (KIP-20)', 'keyed BLAKE2b over the authorizing outpoint and bound output')) };
    });
    function tick() { onUpdate(checks, ctx); }
    tick();

    // ---- local checks (no network)
    settle(cHash, bhex(engineSrc) === s.programHash, short(bhex(engineSrc), 16, 8)); tick();
    try { var svg1 = await runEngine(engineSrc, '1'); settle(cRender, bhex(svg1) === s.renderHash, short(bhex(svg1), 16, 8)); } catch (e) { fail(cRender, e); } tick();
    settle(cBaked, D.templates.factory.suffixHex.indexOf(C.u8hex(C.utf8(engineSrc))) >= 0, 'template suffix contains the engine'); tick();
    eds.forEach(function (e) {
      var consumed = e.ed.index === 0 ? s.genesisTxId : s.editions[e.ed.index - 1].mintTxId;
      settle(e.serial, C.serialFromOutpoint(consumed, 0) === String(e.ed.serial), 'serial ' + e.ed.serial);
    }); tick();

    // ---- chain checks
    var lanePromise = C.resolveLane(io, s).then(function (lane) {
      ctx.lane = lane;
      var st = lane.state, ok = st.program_hash === s.programHash && st.render_hash === s.renderHash && st.artist === s.artist;
      settle(cLane, ok, ok ? ('script ' + short(lane.spk, 14, 6) + ' | ' + st.mints_left + ' mint(s) left | source: ' + lane.source) : 'lane state disagrees with the anchors');
    }).catch(function (e) { fail(cLane, e); }).then(tick);
    var edPromises = eds.map(function (e) {
      return io.tx(e.ed.mintTxId).then(async function (tx) {
        await lanePromise;
        if (!ctx.lane) throw new Error('lane state unavailable, cannot rebuild the edition script');
        var out = tx.outputs[e.ed.outputIndex];
        if (!out) throw new Error('mint transaction has no output ' + e.ed.outputIndex);
        var state = { ownerIdentifier: e.ed.ownerAtMint, identifierType: 0, price: 0, artist: s.artist, royalty_bips: ctx.lane.state.royalty_bips, program_hash: s.programHash, factory_covid: s.laneCovenantId, serial: e.ed.serial };
        var want = C.p2shSpk(C.editionRedeem(state)), got = C.spkOfOutput(out);
        settle(e.spk, got === want, short(want, 14, 6));
        var cov = C.covenantOf(out), authIn = C.inputOutpoint(tx.inputs[Number(cov.authorizingInput)]);
        var rec = C.covenantIdGenesis(authIn.txId, authIn.index, [{ idx: e.ed.outputIndex, value: Number(C.outputValue(out)), script: want }]);
        settle(e.cov, rec === cov.id && rec === e.ed.covenantId, short(rec, 16, 8));
        ctx.editionOk[e.ed.index] = e.spk.status === 'ok' && e.cov.status === 'ok';
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
        h('div', {}, h('span', { text: 'Address' }), h('b', { text: short(st.address, 14, 8), title: st.address }))));
      if (st.status === 'wrongnet') body.appendChild(h('p', { class: 'note warn', text: st.message }));
      body.appendChild(h('p', { class: 'note', text: 'Kaspire signs inside the wallet after showing its own review. This site never receives a key.' }));
      body.appendChild(h('div', { class: 'cta' },
        h('button', { class: 'btn', onclick: function () { copy(st.address, 'Address'); }, text: 'Copy address' }),
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
    var qrBox = h('div', { class: 'dlg' });
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
  K.on(function () { walletChip(); if (walletDlg.open && (K.state().status === 'connected' || K.state().status === 'wrongnet')) renderWalletDialog(); Object.keys(seriesViews).forEach(function (id) { seriesViews[id].refreshCta(); }); });
  $('#wallet-btn').addEventListener('click', openWallet);
  walletDlg.addEventListener('click', function (e) { if (e.target === walletDlg) closeWallet(); });

  /* ------------------------------------------------------------ mint flow */
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
  function ask(draft, s, lane) {
    return new Promise(function (resolve) {
      var m = draft.summary, total = m.price + C.CARRIER + m.fee;
      var wr = h('input', { id: 'wrpc', placeholder: 'ws://localhost:17110 (optional)', value: savedWrpc(), autocomplete: 'off', spellcheck: 'false' });
      var raw = h('pre', { class: 'code', text: JSON.stringify(JSON.parse(C.toSafeJSON(draft)), null, 2) });
      mintScreen(2, 'Review your mint', [
        h('div', { class: 'review' },
          h('div', {}, h('span', { text: 'Series' }), h('b', { text: s.title })),
          h('div', {}, h('span', { text: 'Edition serial' }), h('b', { text: short(m.serial, 8, 6), title: m.serial })),
          h('div', {}, h('span', { text: 'Paid to the artist (100%)' }), h('b', { text: C.fmtKas(m.price) + ' KAS' })),
          h('div', {}, h('span', { text: 'Locked in your edition (carrier)' }), h('b', { text: C.fmtKas(m.carrier) + ' KAS' })),
          h('div', {}, h('span', { text: 'Network fee (estimate)' }), h('b', { text: '≈ ' + C.fmtKas(m.fee) + ' KAS' })),
          h('div', {}, h('span', { text: 'Resale royalty to artist' }), h('b', { text: (Number(m.royaltyBips) / 100) + '%' })),
          h('div', { class: 'tot' }, h('span', { text: 'Leaves your wallet' }), h('b', { text: '≈ ' + C.fmtKas(total) + ' KAS' }))),
        h('p', { class: 'note', text: 'The carrier stays inside the edition contract and belongs to whoever owns the edition. Kaspire will show its own review of this exact transaction before you approve.' }),
        h('details', {}, h('summary', { class: 'note', text: 'Transaction details' }), raw,
          h('div', { class: 'field', style: 'margin-top:10px' }, h('label', { for: 'wrpc', text: 'Broadcast via your own node (wRPC), optional' }), wr)),
        h('div', { class: 'cta' },
          h('button', { class: 'btn primary', onclick: function () { saveWrpc(wr.value.trim()); resolve({ go: true, wrpc: wr.value.trim() }); }, text: 'Sign in Kaspire' }),
          h('button', { class: 'btn ghost', onclick: function () { resolve({ go: false }); }, text: 'Cancel' }))
      ]);
    });
  }
  async function pollConfirm(txId) {
    var t0 = Date.now();
    while (Date.now() - t0 < 4 * 60 * 1000) {
      try { var tx = await io.tx(txId); if (tx && (tx.is_accepted === true || tx.isAccepted === true)) return 'accepted'; if (tx) { /* seen, keep waiting */ } } catch (e) { /* not indexed yet */ }
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
      mintScreen(1, 'Building the transaction…', h('p', { class: 'note', text: 'Looking for a single confirmed output in your wallet that can fund the mint.' }));
      var list = await io.utxos(st.address);
      var probe = C.buildMint({ lane: lane, buyer: { pubkey: st.pubkey, address: st.address }, funding: { txId: '00'.repeat(32), index: 0, amount: 10n ** 13n }, fee: 1n, hrp: A.hrp });
      var fee = C.estimateFee(probe), price = BigInt(lane.state.price);
      var pick = C.pickFunding(list, price + C.CARRIER + fee + 2000000n);
      if (pick.error) throw new Error(pick.error);
      var draft = C.buildMint({ lane: lane, buyer: { pubkey: st.pubkey, address: st.address }, funding: pick, fee: fee, hrp: A.hrp });
      var choice = await ask(draft, s, lane);
      if (!choice.go) { mintDlg.close(); return; }
      mintScreen(3, 'Approve in Kaspire', h('p', { class: 'note', text: 'Kaspire opens its own window (or your phone) with the full transaction. Check the outputs, then approve.' }));
      var signed = await K.signPskt(C.toSafeJSON(draft), [1]);
      mintScreen(4, 'Checking what Kaspire signed…', h('p', { class: 'note', text: 'Every input, output and covenant binding must still match what you reviewed.' }));
      var v = C.verifySigned(draft, signed);
      mintScreen(5, 'Broadcasting…', h('p', { class: 'note', text: st.transport === 'extension' ? 'Kaspire submits the transaction to its node.' : 'Submitting through your node.' }));
      var res = await K.broadcast(signed, v.rpcTx, { wrpc: choice.wrpc ? [choice.wrpc] : A.wrpc || [] });
      if (!res.txId) {
        mintScreen(5, 'Signed, not broadcast', [
          h('p', { class: 'note warn', text: 'Kaspire signed the transaction but it could not be submitted from the browser: ' + (res.message || 'no broadcast path') + '. Nothing has been spent.' }),
          h('p', { class: 'note', text: st.transport === 'mobile' ? 'Covenant transactions need a node that keeps the compute budget. Use Kaspire Extension, or paste your own node (wRPC) address in the review step.' : 'Retry, or paste your own node (wRPC) address in the review step.' }),
          h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: function () { copy(typeof signed === 'string' ? signed : JSON.stringify(signed), 'Signed transaction'); }, text: 'Copy signed transaction' }), h('button', { class: 'btn ghost', onclick: function () { mintDlg.close(); }, text: 'Close' }))]);
        return;
      }
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

  /* ------------------------------------------------------------ gallery */
  var seriesViews = {};
  var STATUS_TXT = { ok: 'Verified in your browser', bad: 'Mismatch: art withheld', wait: 'Verifying…', err: 'Chain unreachable: not fully verified' };
  function renderSeries(s) {
    var engineSrc = D.engines[s.engine];
    var art = h('div', { class: 'art-wrap' }, h('div', { class: 'veil', text: 'Checking the engine…' }));
    var badge = h('div', { class: 'badge wait' }, h('span', { class: 'dot busy' }), h('span', { text: STATUS_TXT.wait }));
    art.appendChild(badge);
    var meter = h('span', { class: 'meter' }), sum = h('span', { text: 'Proof: 0 of 0 checks' });
    var list = h('ul', { class: 'checks' });
    var proof = h('details', { class: 'proof' }, h('summary', {}, meter, sum), list);
    var facts = { price: h('dd', { text: '…' }), roy: h('dd', { text: '…' }), left: h('dd', { text: '…' }) };
    var cta = h('div', { class: 'cta' }), ctaNote = h('p', { class: 'note' });
    var view = { lane: null, result: null, artShown: false };

    function refreshCta() {
      clear(cta); ctaNote.className = 'note'; ctaNote.textContent = '';
      var lane = view.lane, w = K.state();
      if (!lane) { cta.appendChild(h('button', { class: 'btn', disabled: true, text: 'Mint' })); ctaNote.textContent = view.laneError ? 'Could not read the lane from the chain: ' + view.laneError : 'Reading the lane…'; if (view.laneError) ctaNote.classList.add('warn'); return; }
      var left = lane.state.mints_left, price = lane.state.price;
      if (left <= 0n) { cta.appendChild(h('button', { class: 'btn', disabled: true, text: 'Sold out' })); ctaNote.textContent = 'Every edition of this series has been minted. Secondary trading uses the command-line tools today (see Protocol).'; return; }
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
      // Art: shown once the engine and the edition serial are verified locally; withheld on any mismatch.
      var local = checks.slice(0, 3).concat(checks.filter(function (c) { return /serial recomputes/.test(c.label); }));
      var localOk = local.every(function (c) { return c.status === 'ok'; });
      if (st === 'bad') { clear(art); art.appendChild(h('div', { class: 'veil', text: 'Art withheld: a verification check failed. Open the proof for details.' })); art.appendChild(badge); view.artShown = false; }
      else if (localOk && !view.artShown && s.editions.length) {
        view.artShown = true;
        runEngine(engineSrc, s.editions[0].serial).then(function (svg) { var fr = artFrame(svg); art.insertBefore(fr, art.firstChild); var v0 = art.querySelector('.veil'); if (v0) v0.remove(); }).catch(function (e) { $('.veil', art).textContent = 'Engine failed: ' + e.message; });
      }
    }

    function applyLane() {
      var lane = view.lane; if (!lane) return;
      facts.price.textContent = C.fmtKas(lane.state.price) + ' KAS'; facts.roy.textContent = (Number(lane.state.royalty_bips) / 100) + '%';
      var minted = s.editions.length; facts.left.textContent = lane.state.mints_left > 0n ? lane.state.mints_left + ' left' : 'Sold out';
      refreshCta();
    }
    function load() {
      view.lane = null; view.laneError = null; view.artShown = false; refreshCta();
      verifySeries(s, engineSrc, function (checks, ctx) { view.result = { checks: checks, ctx: ctx }; if (ctx.lane) { view.lane = ctx.lane; applyLane(); } paint(checks); refreshCta(); })
        .then(function (r) { if (!r.ctx.lane) { view.laneError = (r.checks.filter(function (c) { return /Live lane/.test(c.label); })[0] || {}).detail; refreshCta(); } });
    }
    view.reload = load;

    // engine explorer
    var serialIn = h('input', { id: 'ex-serial-' + s.id, inputmode: 'numeric', value: '1', 'aria-label': 'Serial number' });
    var frame = h('div', { class: 'frame' }), exHash = h('pre', { class: 'code', text: '' }), exNote = h('p', { class: 'note', text: '' });
    function explore() {
      var v = serialIn.value.trim();
      if (!/^\d{1,19}$/.test(v)) { exNote.textContent = 'Enter a whole number (a serial).'; return; }
      exNote.textContent = 'Rendering…';
      runEngine(engineSrc, v).then(function (svg) {
        clear(frame); frame.appendChild(artFrame(svg));
        exHash.textContent = 'serial      ' + v + '\nseed        ' + seedOf(v) + '  (serial mod 2^32)\nsvg bytes   ' + svg.length + '\nrender_hash ' + bhex(svg);
        var real = s.editions.filter(function (e) { return String(e.serial) === v; })[0];
        exNote.textContent = real ? 'This serial is edition #' + real.index + ', minted on chain.' : 'Preview only: this serial is not a minted edition. Real serials come from the lane outpoint consumed by each mint.';
      }).catch(function (e) { exNote.textContent = 'Engine error: ' + e.message; });
    }
    var ex = h('details', { class: 'proof', style: 'margin-top:14px' }, h('summary', {}, h('span', { text: 'Engine explorer: the art is just a function of the serial' })),
      h('div', { style: 'padding:4px 18px 18px' },
        h('div', { class: 'explorer' }, frame, h('div', {},
          h('div', { class: 'field' }, h('label', { for: serialIn.id, text: 'Serial' }), serialIn),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: explore, text: 'Render' }), h('button', { class: 'btn', onclick: function () { serialIn.value = String(BigInt(Math.floor(Math.random() * 4294967296))); explore(); }, text: 'Random' }),
            h('button', { class: 'btn ghost', onclick: function () { copy(engineSrc, 'Engine source'); }, text: 'Copy engine' })),
          exNote, exHash))));
    ex.addEventListener('toggle', function () { if (ex.open && !frame.firstChild) explore(); });

    var el = h('article', { class: 'series', 'aria-label': s.title }, art,
      h('div', { class: 'series-body' },
        h('div', {}, h('span', { class: 'eyebrow', text: 'Mainnet series' }), h('h3', { text: s.title }), h('p', { class: 'tagline', text: 'A dense isometric BlockDAG city, drawn by ' + new Blob([engineSrc]).size.toLocaleString('en-US') + ' bytes of integer-only code that live inside the contract.' })),
        h('dl', { class: 'facts' }, h('div', {}, h('dt', { text: 'Price' }), facts.price), h('div', {}, h('dt', { text: 'Royalty' }), facts.roy), h('div', {}, h('dt', { text: 'Supply' }), facts.left)),
        cta, ctaNote, proof));
    seriesViews[s.id] = view;
    load();
    return h('div', {}, el, ex);
  }

  /* ------------------------------------------------------------ studio */
  function initStudio() {
    var ed = $('#ed'), ser = $('#ser'), gatesEl = $('#gates-out'), stat = $('#studio-status'), hashes = $('#hashes'), prevBox = $('#prev-box'), tpl = $('#tpl');
    var CAP = D.studio.cap, PRELUDE = D.studio.prelude;
    var BANNED = [[/\bMath\s*\.\s*(random|sin|cos|tan|asin|acos|atan2?|pow|sqrt|hypot|exp|log2?|log10)\b/, 'Math transcendental/random'], [/\bDate\b/, 'Date'], [/\bperformance\b/, 'performance'], [/\bfetch\s*\(/, 'fetch'], [/\bXMLHttpRequest\b/, 'XHR'], [/\bWebSocket\b/, 'WebSocket'], [/\brequire\s*\(/, 'require'], [/\bimport\s*[\(\{]/, 'import'], [/\beval\s*\(/, 'eval'], [/new\s+Function/, 'new Function'], [/\bwindow\b/, 'window'], [/\bdocument\b/, 'document'], [/\blocalStorage\b/, 'localStorage'], [/\bsetTimeout\b|\bsetInterval\b/, 'timer'], [/\bprocess\b/, 'process'], [/\bglobalThis\b/, 'globalThis']];
    function src() { return PRELUDE + '\n' + ed.value; }
    function blen(x) { return C.utf8(x).length; }
    async function gates() {
      var s = src(), out = [], ok = true;
      function chk(name, pass, info) { out.push({ pass: pass, text: name + (info ? '  ' + info : '') }); if (!pass) ok = false; }
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
      clear(gatesEl); out.forEach(function (o) { gatesEl.appendChild(h('div', {}, h('span', { class: o.pass ? 'p' : 'f', text: o.pass ? 'PASS ' : 'FAIL ' }), o.text)); });
      stat.textContent = ok ? 'Gates green: cleared to export. Run reliks-lens.js for the full L0 to L10 suite.' : 'Gates failed: fix these before export.';
      return ok;
    }
    async function show() {
      var v = ser.value.trim() || '1';
      if (!/^\d{1,19}$/.test(v)) { stat.textContent = 'Serial must be a whole number.'; return; }
      var svg; try { svg = await runEngine(src(), v); } catch (e) { stat.textContent = 'Error: ' + e.message; return; }
      clear(prevBox); prevBox.appendChild(artFrame(svg, '#000'));
      hashes.textContent = 'engine_hash ' + bhex(src()) + '\nrender_hash ' + bhex(svg) + '\nengine_bytes ' + blen(src()) + ' / ' + CAP;
      await gates();
    }
    function download(fn, text) { var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: fn }); document.body.appendChild(a); a.click(); a.remove(); }
    function slug() { return ($('#name').value || 'my-engine').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'my-engine'; }
    $('#exe').addEventListener('click', async function () {
      if (!(await gates())) { toast('Fix the failing gates before exporting.', 'bad'); return; }
      var name = slug();
      download(name + '.js', ["const { blake2b: b2 } = require('./web/blake2b.js');", "const blake2b = (m, o) => b2(m, (o && o.dkLen) || 32);", "const B = Buffer;", 'const ENGINE_SRC = ' + JSON.stringify(src()) + ';', 'const TEST_SERIAL = 1;',
        "function seedLanes(serial){const le=B.alloc(8);le.writeBigUInt64LE(BigInt(serial));const h=blake2b(B.concat([B.from('ReliksSeedV10','utf8'),le]),{dkLen:32});const dv=new DataView(h.buffer,h.byteOffset,h.byteLength);const lanes=[];for(let i=0;i<8;i++)lanes.push(dv.getInt32(i*4,true));return lanes;}",
        "const compiled=new Function('L','serial',ENGINE_SRC+'\\nreturn reliks(L,serial);');", 'function render(serial){const s=Number(BigInt(serial)&0xFFFFFFFFn);return compiled(seedLanes(s),s|0);}',
        "const engineHashHex=B.from(blake2b(B.from(ENGINE_SRC,'utf8'),{dkLen:32})).toString('hex');", "const renderHashHex=B.from(blake2b(B.from(render(TEST_SERIAL),'utf8'),{dkLen:32})).toString('hex');", 'module.exports={ENGINE_SRC,seedLanes,render,engineHashHex,renderHashHex,TEST_SERIAL};'].join('\n') + '\n');
      stat.textContent = 'Exported ' + name + '.js. Next: node reliks-lens.js ' + name + '.js';
    });
    $('#exs').addEventListener('click', function () {
      var w = K.state(), artist = ($('#artist').value.trim() || (w.status === 'connected' ? w.pubkey : '')).toLowerCase();
      var price = $('#price').value.trim(), roy = Number($('#roy').value), n = Number($('#eds').value), err = '';
      var priceSompi; try { priceSompi = price === '' ? -1n : BigInt(Math.round(Number(price) * 1e8)); } catch (e) { priceSompi = -1n; }
      if (!/^[0-9a-f]{64}$/.test(artist)) err = 'Artist key must be 64 hex characters (connect Kaspire to fill it in).';
      else if (priceSompi !== 0n && !(priceSompi >= SOMPI)) err = 'Price must be 0 or at least 1 KAS.';
      else if (!(roy >= 0.01 && roy <= 20)) err = 'Royalty must be between 0.01% and 20%.';
      else if (!(Number.isInteger(n) && n >= 1)) err = 'Editions must be a whole number of at least 1.';
      if (err) { stat.textContent = err; toast(err, 'bad'); return; }
      download('series-' + slug() + '.json', JSON.stringify({ artist: artist, price: Number(priceSompi), royalty_bips: Math.round(roy * 100), mints_left: n }, null, 2) + '\n');
      stat.textContent = 'Exported series-' + slug() + '.json';
    });
    $('#load').addEventListener('click', function () { ed.value = D.studio.templates[tpl.value] || D.studio.templates.circles; show(); });
    $('#go').addEventListener('click', show);
    $('#rnd').addEventListener('click', function () { ser.value = String(Math.floor(Math.random() * 4294967296)); show(); });
    $('#run-gates').addEventListener('click', gates);
    K.on(function (st) { var a = $('#artist'); if (st.status === 'connected' && !a.value) a.placeholder = 'from Kaspire: ' + short(st.pubkey, 10, 6); });
    ed.value = D.studio.templates.circles;
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
  walletChip();
  K.restore().then(walletChip);
  showTab(location.hash.slice(1) || 'gallery');
  window.__reliks = { C: C, K: K, verifySeries: verifySeries, runEngine: runEngine, views: seriesViews };
})();
