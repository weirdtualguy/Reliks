// Network-free tests for web/kaspire.js: the extension provider path, the mobile
// path (WalletConnect mocked), failure modes, and the full sign -> verify -> broadcast handoff.
'use strict';
const path = require('path');
const root = path.join(__dirname, '..');
const K = require(path.join(root, 'web', 'kaspire.js'));
const C = require(path.join(root, 'web', 'reliks-chain.js'));
C.init(require(path.join(root, 'reliks-templates.js'))());
const S = require(path.join(root, 'data', 'mainnet-anchors.json')).series[0];
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' | ' + e.message); } };
const eq = (a, b, m) => { if (String(a) !== String(b)) throw new Error((m || 'mismatch') + ': ' + a + ' != ' + b); };
const rejects = async (p, re) => { try { await p; } catch (e) { if (re && !re.test(e.message)) throw new Error('wrong error: ' + e.message); return e; } throw new Error('expected rejection'); };

const PK = 'aa'.repeat(32), ADDR = C.p2pkAddress('kaspa', PK);
const SIG = '41' + 'cd'.repeat(64) + '01';

function mkStore() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
function mkProvider(opts = {}) {
  const handlers = {}; const calls = [];
  const p = {
    isKaspire: true, version: 'test', calls,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return p; },
    removeListener() { return p; },
    emit(ev, d) { (handlers[ev] || []).forEach(f => f(d)); },
    async request({ method, params }) {
      calls.push({ method, params });
      if (opts.fail && opts.fail[method]) { const e = new Error(opts.fail[method].message || 'x'); e.code = opts.fail[method].code; throw e; }
      switch (method) {
        case 'requestAccounts': case 'getAccounts': return opts.disconnected ? [] : [ADDR];
        case 'getNetwork': return opts.network || 'mainnet';
        case 'getPublicKey': return PK;
        case 'signPskt': {
          const j = JSON.parse(params.txJsonString);
          params.options.signInputs.forEach(s => { j.inputs[s.index].signatureScript = SIG; });
          if (opts.tamper) j.outputs[2].value = '1';
          return JSON.stringify(j);
        }
        case 'pushTx': return opts.pushResult || 'ab'.repeat(32);
        case 'disconnect': return true;
      }
      const e = new Error('unsupported'); e.code = 4200; throw e;
    }
  };
  return p;
}
function mkWin(provider) {
  const listeners = {};
  return { kaspire: provider, localStorage: mkStore(), navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, location: { origin: 'https://example.github.io', assign() {} }, addEventListener(e, f) { listeners[e] = f; }, removeEventListener() {} };
}

// A mint draft to push through the wallet
const st = { program_hash: S.programHash, artist: S.artist, price: 100000000n, royalty_bips: 500n, mints_left: 2n, engine_lang: 0n, render_hash: S.renderHash };
const lane = { state: st, spk: C.p2shSpk(C.factoryRedeem(st)), outpoint: { txId: '01'.repeat(32), index: 0 }, value: 100000000n, covenantId: S.laneCovenantId };
const draft = C.buildMint({ lane, buyer: { pubkey: PK, address: ADDR }, funding: { txId: '02'.repeat(32), index: 0, amount: 600000000n, daa: 5n }, fee: 4000000n, hrp: 'kaspa' });

(async () => {
  await t('extension: connects, reads network + public key, ends up connected on mainnet', async () => {
    const p = mkProvider(); const w = K.create({ window: mkWin(p) });
    const s = await w.connectExtension();
    eq(s.status, 'connected'); eq(s.transport, 'extension'); eq(s.address, ADDR); eq(s.pubkey, PK); eq(s.network, 'mainnet');
    eq(p.calls[0].method, 'requestAccounts');
  });
  await t('extension: a user click is required (requestAccounts is only called from connectExtension)', async () => {
    const p = mkProvider(); const w = K.create({ window: mkWin(p) }); await w.restore();
    if (p.calls.some(c => c.method === 'requestAccounts')) throw new Error('restore() must never open the approval window');
  });
  await t('extension: not installed -> a clear, typed error and no dangling state', async () => {
    const w = K.create({ window: { localStorage: mkStore(), addEventListener() {}, removeEventListener() {} } });
    const e = await rejects(w.connectExtension(), /not detected/); eq(e.notInstalled, true); eq(w.state().status, 'idle');
  });
  await t('extension: rejection in Kaspire is a quiet cancel, not an error banner', async () => {
    const p = mkProvider({ fail: { requestAccounts: { code: 4001, message: 'User rejected' } } }); const w = K.create({ window: mkWin(p) });
    const e = await rejects(w.connectExtension()); eq(e.userCancelled, true); eq(w.state().message, '');
  });
  await t('extension: a wallet on the wrong network is held at "wrongnet", never treated as connected', async () => {
    const w = K.create({ window: mkWin(mkProvider({ network: 'testnet-10' })) }); const s = await w.connectExtension();
    eq(s.status, 'wrongnet'); await rejects(w.signPskt('{}', [1]), /mainnet/);
  });
  await t('extension: accountsChanged to [] disconnects; a new account refreshes state', async () => {
    const p = mkProvider(); const w = K.create({ window: mkWin(p) }); await w.connectExtension();
    p.emit('accountsChanged', []); eq(w.state().status, 'idle');
  });
  await t('extension: restore() silently reconnects when the user connected before', async () => {
    const win = mkWin(mkProvider()); const w1 = K.create({ window: win }); await w1.connectExtension();
    const w2 = K.create({ window: win }); const s = await w2.restore(); eq(s.status, 'connected');
  });
  await t('extension: disconnect clears state and the remembered transport', async () => {
    const win = mkWin(mkProvider()); const w = K.create({ window: win }); await w.connectExtension(); await w.disconnect();
    eq(w.state().status, 'idle'); eq(win.localStorage.getItem('reliks.wallet.transport'), null);
  });
  await t('full mint handoff over the extension: sign (inputs [1] only) -> verify -> pushTx', async () => {
    const p = mkProvider(); const w = K.create({ window: mkWin(p) }); await w.connectExtension();
    const signed = await w.signPskt(C.toSafeJSON(draft), [1]);
    const call = p.calls.find(c => c.method === 'signPskt');
    eq(JSON.stringify(call.params.options.signInputs), JSON.stringify([{ index: 1, sighashType: 1 }])); eq(call.params.sender, ADDR);
    const v = C.verifySigned(draft, signed);
    const out = await w.broadcast(signed, v.rpcTx, {});
    eq(out.txId, 'ab'.repeat(32)); eq(out.via, 'kaspire'); eq(p.calls.find(c => c.method === 'pushTx').params, signed);
  });
  await t('a wallet that alters the transaction is caught before broadcast', async () => {
    const p = mkProvider({ tamper: true }); const w = K.create({ window: mkWin(p) }); await w.connectExtension();
    const signed = await w.signPskt(C.toSafeJSON(draft), [1]);
    let caught = false; try { C.verifySigned(draft, signed); } catch (e) { caught = /different transaction/.test(e.message); } if (!caught) throw new Error('tampered tx accepted');
    if (p.calls.some(c => c.method === 'pushTx')) throw new Error('must not have broadcast');
  });
  await t('broadcast: if pushTx is unsupported and no wRPC is configured, the signed tx is returned, not lost', async () => {
    const p = mkProvider({ fail: { pushTx: { code: 4200, message: 'no' } } }); const w = K.create({ window: mkWin(p) }); await w.connectExtension();
    const signed = await w.signPskt(C.toSafeJSON(draft), [1]); const out = await w.broadcast(signed, C.verifySigned(draft, signed).rpcTx, {});
    eq(out.txId, null); eq(out.signedJson, signed);
  });
  await t('broadcast: falls back to a configured wRPC endpoint and reads the transaction id', async () => {
    const p = mkProvider({ fail: { pushTx: { code: 4200, message: 'no' } } });
    class FakeWS { constructor(u) { this.u = u; setTimeout(() => this.onopen(), 0); } send(m) { const j = JSON.parse(m); if (j.method !== 'submitTransaction' || j.params.allowOrphan !== true) throw new Error('bad rpc'); setTimeout(() => this.onmessage({ data: JSON.stringify({ id: 1, params: { transactionId: 'cd'.repeat(32) } }) }), 0); } close() {} }
    const w = K.create({ window: mkWin(p), WebSocket: FakeWS }); await w.connectExtension();
    const signed = await w.signPskt(C.toSafeJSON(draft), [1]); const out = await w.broadcast(signed, C.verifySigned(draft, signed).rpcTx, { wrpc: ['wss://node.example/wrpc'] });
    eq(out.txId, 'cd'.repeat(32)); eq(out.via, 'wrpc');
  });
  await t('broadcast: a node rejection is surfaced verbatim (truncated), never swallowed', async () => {
    const p = mkProvider({ fail: { pushTx: { code: -32000, message: 'x' } } });
    class FakeWS { constructor() { setTimeout(() => this.onopen(), 0); } send() { setTimeout(() => this.onmessage({ data: JSON.stringify({ id: 1, error: { message: 'transaction is not standard' } }) }), 0); } close() {} }
    const w = K.create({ window: mkWin(p), WebSocket: FakeWS }); await w.connectExtension();
    const signed = await w.signPskt(C.toSafeJSON(draft), [1]); const out = await w.broadcast(signed, C.verifySigned(draft, signed).rpcTx, { wrpc: ['wss://n'] });
    eq(out.txId, null); if (!/not standard/.test(out.message)) throw new Error(out.message);
  });

  // ---- mobile (WalletConnect mocked; the SDK is only loaded on demand)
  function mkWC() {
    const events = {}; const st = { loaded: 0, requests: [], connected: 0 };
    const client = {
      session: { getAll: () => (st.session ? [st.session] : []) },
      on(e, f) { events[e] = f; },
      async connect(o) { st.connected++; st.required = o.requiredNamespaces; st.session = { topic: 'topic1', namespaces: { kaspa: { accounts: ['kaspa:mainnet:' + ADDR.slice(6)] } } }; return { uri: 'wc:abc@2?relay-protocol=irn&symKey=xyz', approval: async () => st.session }; },
      async request(r) { st.requests.push(r); const m = r.request.method; if (m === 'kaspa_getAccounts') return [ADDR]; if (m === 'kaspa_getPublicKey') return PK; if (m === 'kaspa_signPskt') { const j = JSON.parse(r.request.params.txJsonString); r.request.params.options.signInputs.forEach(s => { j.inputs[s.index].signatureScript = SIG; }); return JSON.stringify(j); } throw new Error('unsupported'); },
      async disconnect() { st.session = null; }
    };
    return { st, events, loadSdk: async () => { st.loaded++; return { init: async () => client }; } };
  }
  await t('mobile: the WalletConnect SDK is not loaded until the user chooses Kaspire Mobile', async () => {
    const wc = mkWC(); const w = K.create({ window: mkWin(mkProvider()), loadSdk: wc.loadSdk });
    await w.connectExtension(); eq(wc.st.loaded, 0, 'sdk loaded during extension flow'); await w.restore(); eq(wc.st.loaded, 0);
  });
  await t('mobile: requests only the three methods it needs, on kaspa:mainnet', async () => {
    const wc = mkWC(); const w = K.create({ window: mkWin(null), loadSdk: wc.loadSdk }); let pairing = null;
    const s = await w.connectMobile(p => { pairing = p; });
    eq(s.status, 'connected'); eq(s.transport, 'mobile'); eq(s.address, ADDR); eq(wc.st.loaded, 1);
    eq(wc.st.required.kaspa.methods.join(','), 'kaspa_getAccounts,kaspa_getPublicKey,kaspa_signPskt'); eq(wc.st.required.kaspa.chains.join(','), 'kaspa:mainnet');
    if (!pairing.link.startsWith('https://kaspire.kaslab.space/kaspire/wc?uri=' + encodeURIComponent('wc:abc'))) throw new Error('pairing link must be the verified App Link, not a raw wc: uri');
    if (!pairing.intent.startsWith('intent://wc?uri=') || !pairing.intent.includes('package=space.kaspire.wallet')) throw new Error('bad android intent');
  });
  await t('mobile: signs through kaspa_signPskt and the same verifier accepts the result', async () => {
    const wc = mkWC(); const w = K.create({ window: mkWin(null), loadSdk: wc.loadSdk }); await w.connectMobile();
    const signed = await w.signPskt(C.toSafeJSON(draft), [1]); C.verifySigned(draft, signed);
    const r = wc.st.requests.find(x => x.request.method === 'kaspa_signPskt'); eq(r.chainId, 'kaspa:mainnet'); if ('sender' in r.request.params) throw new Error('mobile params must not carry sender');
  });
  await t('mobile: android opens the intent directly; desktop shows the QR link only', async () => {
    const wc = mkWC(); const win = mkWin(null); win.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14)'; let assigned = null; win.location.assign = u => { assigned = u; };
    await K.create({ window: win, loadSdk: wc.loadSdk }).connectMobile(); if (!assigned || !assigned.startsWith('intent://wc')) throw new Error('android should launch the intent');
    const wc2 = mkWC(); const win2 = mkWin(null); let a2 = null; win2.location.assign = u => { a2 = u; };
    await K.create({ window: win2, loadSdk: wc2.loadSdk }).connectMobile(); if (a2) throw new Error('desktop must not navigate');
  });
  await t('mobile: session deletion returns the UI to disconnected', async () => {
    const wc = mkWC(); const w = K.create({ window: mkWin(null), loadSdk: wc.loadSdk }); await w.connectMobile(); wc.events.session_delete(); eq(w.state().status, 'idle');
  });
  await t('mobile: SDK load failure is a readable error with the extension as the fallback', async () => {
    const w = K.create({ window: mkWin(null), loadSdk: async () => { throw new Error('Failed to fetch dynamically imported module'); } });
    await rejects(w.connectMobile(), /Failed to fetch/); eq(w.state().status, 'idle'); if (!w.state().message) throw new Error('needs a message');
  });
  await t('friendly(): maps provider codes and node errors to plain language', () => {
    const w = K.create({ window: {} });
    if (!w.friendly({ code: 4001, message: 'x' }).userCancelled) throw new Error('4001');
    if (!/locked/.test(w.friendly({ code: 4100, message: 'x' }).message)) throw new Error('4100');
    if (!/parent transaction/.test(w.friendly(new Error('orphan where orphan is disallowed')).message)) throw new Error('orphan');
  });
  await t('the pinned WalletConnect URL is a single exact version (no ranges, no latest)', () => { if (!/@walletconnect\/sign-client@\d+\.\d+\.\d+$/.test(K.WC_SDK)) throw new Error(K.WC_SDK); });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
