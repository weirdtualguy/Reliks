/* Kaspire wallet connector for Reliks.

   Two transports, one interface:

   1. Kaspire Extension (Chromium): the injected `window.kaspire` provider.
      No dependency, no relay, no QR code. This is the default and the only path
      that can also broadcast (`pushTx`).
   2. Kaspire Mobile (Android): WalletConnect v2. The SDK is NOT part of the
      page. It is fetched from one pinned URL only after the user taps
      "Kaspire Mobile", so the site, the verification path and the extension
      flow never load third-party code.

   Neither transport ever sees a private key. Signing happens inside Kaspire
   after it shows its own review of the exact transaction.

   Protocol references (verified 2026-09): kaspire.kaslab.space/developers and
   kaspire.kaslab.space/developers/extension. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Kaspire = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LINKS = {
    extension: 'https://chromewebstore.google.com/detail/kaspire-wallet/ldjonnkfjmcingabncepnibledcanmoe',
    app: 'https://kaspire.kaslab.space/#download',
    walletConnectLink: 'https://kaspire.kaslab.space/kaspire/wc?uri=',
    packageName: 'space.kaspire.wallet'
  };
  // Pinned. Only ever loaded on demand for the mobile transport.
  var WC_SDK = 'https://esm.sh/@walletconnect/sign-client@2.13.0';
  var WC_PROJECT_ID = '2f5b63e20302f9ce15971f44ff1cdfca';   // public application id (allowlist the Pages origin in Reown)
  var WC_CHAIN = 'kaspa:mainnet';
  var WC_METHODS = ['kaspa_getAccounts', 'kaspa_getPublicKey', 'kaspa_signPskt'];   // minimum needed
  var REQUEST_TIMEOUT_MS = 6 * 60 * 1000;
  var STORE_KEY = 'reliks.wallet.transport';

  function create(env) {
    env = env || {};
    var win = env.window || (typeof window !== 'undefined' ? window : {});
    var store = env.storage || (function () { try { return win.localStorage; } catch (e) { return null; } })();
    var loadSdk = env.loadSdk || function () { return import(WC_SDK).then(function (m) { return m.default || m.SignClient || m; }); };
    var wsCtor = env.WebSocket || win.WebSocket;
    var listeners = [];
    var s = { status: 'idle', transport: null, address: null, pubkey: null, network: null, message: '' };
    var signClient = null, wcSession = null, provider = null, providerHooks = null;

    function snapshot() { return { status: s.status, transport: s.transport, address: s.address, pubkey: s.pubkey, network: s.network, message: s.message }; }
    function emit() { var snap = snapshot(); listeners.slice().forEach(function (f) { try { f(snap); } catch (e) { /* listener errors never break the wallet layer */ } }); }
    function set(patch) { for (var k in patch) s[k] = patch[k]; emit(); }
    function remember(v) { try { if (store) { if (v) store.setItem(STORE_KEY, v); else store.removeItem(STORE_KEY); } } catch (e) { /* storage may be blocked */ } }
    function remembered() { try { return store ? store.getItem(STORE_KEY) : null; } catch (e) { return null; } }

    /* ------------------------------------------------ errors */
    function friendly(err) {
      var code = err && err.code, msg = String((err && err.message) || err || 'unknown error');
      var e = new Error(msg); e.code = code;
      if (code === 4001 || /reject|denied|cancel/i.test(msg)) { e.message = 'You declined the request in Kaspire.'; e.userCancelled = true; }
      else if (code === 4100) e.message = 'Kaspire is locked, or this site is not connected. Unlock Kaspire and connect again.';
      else if (code === 4200 || code === -32601) { e.message = 'This Kaspire version does not support that operation.'; e.unsupported = true; }
      else if (/orphan where orphan is disallowed/i.test(msg)) e.message = 'The node has not seen the parent transaction yet. Wait a few seconds and try again; your funds are safe.';
      else if (/already in the mempool/i.test(msg)) { e.message = 'This transaction was already submitted. Waiting for a block.'; e.duplicate = true; }
      else if (/required (?:fee|amount)/i.test(msg)) { e.message = 'The network asked for a higher fee than estimated. Nothing was spent; try again.'; e.fee = true; }
      else if (/script units exceeded/i.test(msg)) e.message = 'The node rejected the compute budget. This endpoint cannot carry covenant transactions.';
      return e;
    }
    function withTimeout(promise, label) {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error(label + ' timed out. Nothing was signed.')); }, REQUEST_TIMEOUT_MS);
        promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
      });
    }

    /* ------------------------------------------------ extension transport */
    function detectExtension(timeoutMs) {
      timeoutMs = timeoutMs == null ? 1200 : timeoutMs;
      if (win.kaspire && win.kaspire.isKaspire) return Promise.resolve(win.kaspire);
      return new Promise(function (resolve) {
        var done = false;
        function fin(v) { if (done) return; done = true; clearTimeout(t); if (win.removeEventListener) win.removeEventListener('kaspire#initialized', onInit); resolve(v); }
        function onInit() { fin(win.kaspire && win.kaspire.isKaspire ? win.kaspire : null); }
        var t = setTimeout(function () { fin(null); }, timeoutMs);
        if (win.addEventListener) win.addEventListener('kaspire#initialized', onInit, { once: true }); else fin(null);
      });
    }
    function extReq(method, params) {
      return withTimeout(provider.request(params === undefined ? { method: method } : { method: method, params: params }), method).catch(function (e) { throw friendly(e); });
    }
    function bindProvider(p) {
      provider = p;
      if (providerHooks) return;
      providerHooks = {
        accounts: function (a) { if (s.transport !== 'extension') return; if (!a || !a.length) return drop('Wallet disconnected.'); refreshExtension(); },
        network: function () { if (s.transport === 'extension') refreshExtension(); },
        disconnect: function () { if (s.transport === 'extension') drop('Wallet disconnected.'); }
      };
      try {
        p.on('accountsChanged', providerHooks.accounts);
        p.on('networkChanged', providerHooks.network);
        p.on('chainChanged', providerHooks.network);
        p.on('disconnect', providerHooks.disconnect);
      } catch (e) { /* older providers may lack some events */ }
    }
    async function refreshExtension() {
      var accounts = await extReq('getAccounts');
      if (!accounts || !accounts.length) return drop('');
      var address = accounts[0];
      var network = await extReq('getNetwork');
      var pubkey = await extReq('getPublicKey');
      pubkey = typeof pubkey === 'string' ? pubkey : (pubkey && (pubkey.publicKey || pubkey.result)) || '';
      finish('extension', address, String(pubkey).toLowerCase(), network);
    }
    async function connectExtension() {
      set({ status: 'connecting', transport: 'extension', message: 'Waiting for Kaspire…' });
      var p = await detectExtension();
      if (!p) { set({ status: 'idle', transport: null, message: '' }); var e = new Error('Kaspire Extension was not detected in this browser.'); e.notInstalled = true; throw e; }
      bindProvider(p);
      try {
        var accounts = await extReq('requestAccounts');   // opens Kaspire's own approval window
        if (!accounts || !accounts[0]) throw new Error('No account was approved.');
        await refreshExtension();
        remember('extension');
      } catch (e) { set({ status: 'idle', transport: null, message: e.userCancelled ? '' : e.message }); throw e; }
      return snapshot();
    }

    /* ------------------------------------------------ mobile transport (WalletConnect v2, on demand) */
    function pairingLinks(uri) {
      var link = LINKS.walletConnectLink + encodeURIComponent(uri);
      var intent = 'intent://wc?uri=' + encodeURIComponent(uri) + '#Intent;scheme=kaspire;package=' + LINKS.packageName + ';S.browser_fallback_url=' + encodeURIComponent(link) + ';end';
      return { link: link, intent: intent };
    }
    function accountFromSession(session) {
      var ns = session && session.namespaces && session.namespaces.kaspa;
      var caip = ns && ns.accounts && ns.accounts[0];
      return caip ? 'kaspa:' + caip.split(':').slice(2).join(':') : null;
    }
    async function ensureClient() {
      if (signClient) return signClient;
      var SignClient = await loadSdk();
      signClient = await SignClient.init({ projectId: WC_PROJECT_ID, metadata: { name: 'Reliks', description: 'Generative art on Kaspa', url: win.location ? win.location.origin : '', icons: [] } });
      signClient.on('session_delete', function () { if (s.transport === 'mobile') drop('Wallet disconnected.'); });
      signClient.on('session_expire', function () { if (s.transport === 'mobile') drop('Wallet session expired.'); });
      signClient.on('session_event', function (ev) {
        var p = ev && ev.params; if (p && p.event && p.event.name === 'accountsChanged' && s.transport === 'mobile') refreshMobile().catch(function () {});
      });
      return signClient;
    }
    function wcReq(method, params) {
      return withTimeout(signClient.request({ topic: wcSession.topic, chainId: WC_CHAIN, request: { method: method, params: params } }), method).catch(function (e) { throw friendly(e); });
    }
    async function refreshMobile() {
      var accounts = await wcReq('kaspa_getAccounts', {});
      var address = (accounts && accounts[0]) || accountFromSession(wcSession);
      var pk = await wcReq('kaspa_getPublicKey', {});
      pk = typeof pk === 'string' ? pk : (pk && (pk.publicKey || pk.result)) || '';
      finish('mobile', address, String(pk).toLowerCase(), /^kaspatest:/.test(address || '') ? 'testnet' : 'mainnet');
    }
    // onPairing({link, intent, isAndroid}) lets the UI show a QR code or open the app.
    async function connectMobile(onPairing) {
      set({ status: 'connecting', transport: 'mobile', message: 'Loading WalletConnect…' });
      try {
        await ensureClient();
        var res = await signClient.connect({ requiredNamespaces: { kaspa: { chains: [WC_CHAIN], methods: WC_METHODS, events: ['accountsChanged'] } } });
        if (!res.uri) throw new Error('WalletConnect did not return a pairing link.');
        var links = pairingLinks(res.uri);        // never logged, never stored
        var isAndroid = /Android/i.test((win.navigator && win.navigator.userAgent) || '');
        set({ message: isAndroid ? 'Opening Kaspire…' : 'Scan with Kaspire on your phone' });
        if (onPairing) onPairing({ link: links.link, intent: links.intent, isAndroid: isAndroid });
        if (isAndroid && win.location) win.location.assign(links.intent);
        wcSession = await res.approval();
        await refreshMobile();
        remember('mobile');
      } catch (e) { var fe = friendly(e); set({ status: 'idle', transport: null, message: fe.userCancelled ? '' : fe.message }); throw fe; }
      return snapshot();
    }
    async function restoreMobile() {
      await ensureClient();
      var all = signClient.session.getAll().filter(function (x) { return x.namespaces && x.namespaces.kaspa; });
      if (!all.length) { remember(null); return false; }
      wcSession = all[all.length - 1];
      await refreshMobile();
      return true;
    }

    /* ------------------------------------------------ shared state */
    function finish(transport, address, pubkey, network) {
      var net = network === 'mainnet' ? 'mainnet' : String(network || 'unknown');
      if (net !== 'mainnet') return set({ status: 'wrongnet', transport: transport, address: address, pubkey: pubkey, network: net, message: 'Reliks runs on Kaspa mainnet. Switch Kaspire to Mainnet.' });
      if (!address || !/^[0-9a-f]{64}$/.test(pubkey)) return set({ status: 'error', transport: transport, address: address, pubkey: null, network: net, message: 'Kaspire did not return a usable account.' });
      set({ status: 'connected', transport: transport, address: address, pubkey: pubkey, network: net, message: '' });
    }
    function drop(message) {
      wcSession = null;
      set({ status: 'idle', transport: null, address: null, pubkey: null, network: null, message: message || '' });
      remember(null);
    }
    async function disconnect() {
      var t = s.transport;
      try {
        if (t === 'extension' && provider) await provider.request({ method: 'disconnect' });
        if (t === 'mobile' && signClient && wcSession) await signClient.disconnect({ topic: wcSession.topic, reason: { code: 6000, message: 'User disconnected' } });
      } catch (e) { /* the local state is cleared regardless */ }
      drop('');
    }
    // Silent restore on page load. Never opens a wallet window.
    async function restore() {
      var t = remembered();
      try {
        if (t === 'extension') { var p = await detectExtension(1500); if (p) { bindProvider(p); set({ status: 'connecting', transport: 'extension' }); await refreshExtension(); } else remember(null); }
        else if (t === 'mobile') { if (!(await restoreMobile())) drop(''); }
      } catch (e) { drop(''); }
      return snapshot();
    }

    /* ------------------------------------------------ signing and broadcasting */
    function requireConnected() {
      if (s.status !== 'connected') { var e = new Error(s.status === 'wrongnet' ? 'Switch Kaspire to Kaspa mainnet.' : 'Connect Kaspire first.'); e.code = 4100; throw e; }
    }
    // Ask Kaspire to sign only the given input indexes of a SafeJSON transaction (SIGHASH_ALL).
    // Kaspire shows its own review; the dApp cannot influence what that review says.
    async function signPskt(txJson, inputIndexes) {
      requireConnected();
      var signInputs = inputIndexes.map(function (i) { return { index: i, sighashType: 1 }; });
      var res;
      if (s.transport === 'extension') res = await extReq('signPskt', { sender: s.address, txJsonString: txJson, options: { signInputs: signInputs } });
      else res = await wcReq('kaspa_signPskt', { txJsonString: txJson, options: { signInputs: signInputs } });
      if (res && typeof res === 'object') res = res.psktTransactionJson || res.signedTxJson || res.txJsonString || res;
      if (typeof res !== 'string') throw new Error('Kaspire returned an unexpected signing result.');
      return res;
    }
    function wrpcSubmit(urls, rpcTx) {
      return new Promise(function (resolve) {
        if (!wsCtor || !urls || !urls.length) return resolve({ txId: null, message: 'No wRPC endpoint is configured.' });
        var last = 'no endpoint answered';
        (function next(k) {
          if (k >= urls.length) return resolve({ txId: null, message: last });
          var ws, done = false, t;
          function fin(v) { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch (e) { /* closed */ } if (v) resolve(v); else next(k + 1); }
          try { ws = new wsCtor(urls[k]); } catch (e) { last = String(e.message || e); return next(k + 1); }
          t = setTimeout(function () { last = urls[k] + ' timed out'; fin(null); }, 15000);
          ws.onopen = function () { ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: Object.assign({}, rpcTx, { mass: rpcTx.mass === undefined ? 0 : rpcTx.mass }), allowOrphan: true } })); };
          ws.onerror = function () { last = urls[k] + ' refused the connection'; fin(null); };
          ws.onmessage = function (m) {
            try {
              var j = JSON.parse(m.data), r = j.params || j.result || {};
              if (r.transactionId) return fin({ txId: r.transactionId });
              last = String((j.error && (j.error.message || j.error)) || r.message || m.data).slice(0, 240);
            } catch (e) { last = 'unreadable node response'; }
            fin(null);
          };
        })(0);
      });
    }
    // Broadcast a signed transaction. Extension: Kaspire's own pushTx (compute budget preserved).
    // Otherwise a wRPC endpoint from `opts.wrpc`. If neither works the caller gets the signed
    // transaction back so nothing is lost.
    async function broadcast(signedJson, rpcTx, opts) {
      opts = opts || {};
      var failure = '';
      if (s.transport === 'extension' && provider) {
        try {
          var res = await extReq('pushTx', signedJson);
          var id = typeof res === 'string' ? res : (res && (res.transactionId || res.txId));
          if (id) return { txId: id, via: 'kaspire' };
        } catch (e) { if (e.userCancelled) throw e; failure = e.message; }
      }
      var w = await wrpcSubmit(opts.wrpc, rpcTx);
      if (w.txId) return { txId: w.txId, via: 'wrpc' };
      // Prefer the node's own words when a node was actually asked.
      return { txId: null, signedJson: signedJson, message: (opts.wrpc && opts.wrpc.length && w.message) || failure || w.message };
    }

    return {
      on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
      state: snapshot, detectExtension: detectExtension, connectExtension: connectExtension, connectMobile: connectMobile,
      disconnect: disconnect, restore: restore, signPskt: signPskt, broadcast: broadcast,
      links: LINKS, wcSdkUrl: WC_SDK, wcMethods: WC_METHODS.slice(), friendly: friendly, pairingLinks: pairingLinks
    };
  }

  var api = { create: create, LINKS: LINKS, WC_SDK: WC_SDK };
  return api;
});
