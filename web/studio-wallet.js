// Browser WebSocket lacks Node-ws terminate(); WC relayer ping-timeout calls it.
if (typeof WebSocket !== 'undefined' && !WebSocket.prototype.terminate) {
  WebSocket.prototype.terminate = function () { try { this.close(); } catch (e) {} };
}
var ReliksWallet = (function() {
  function getKaspaChainId(){var hrp=(window.REG&&window.REG.hrp)||"kaspa";if(hrp==="kaspatest")return"kaspa:testnet";return"kaspa:mainnet";}

  var connected = false;
  var state = "idle"; // idle, connecting, connected, wrongnet, error
  var network = null; // mainnet, testnet
  var pubkey = null;
  var address = null;
  var signClient = null;
  var session = null;
  var projectId = '2f5b63e20302f9ce15971f44ff1cdfca';
  var qrContainer = null;

  function renderQr(el, text) {
    if (window.qrcode) {
      var qr = window.qrcode(0, 'M');
      qr.addData(text); qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
      return true;
    }
    return false;
  }

  async function init() {
    if (signClient) return signClient;
    if (!window.SignClient) {
      var loaded = await new Promise(function(res) {
        var t = setTimeout(function() { res(false); }, 10000);
        window.addEventListener('signclient-loaded', function() { clearTimeout(t); res(true); }, { once: true });
      });
      if (!loaded || !window.SignClient) { console.warn('SignClient not loaded yet'); return null; }
    }
    try {
      signClient = await window.SignClient.init({
        projectId: projectId,
        metadata: {
          name: "Reliks Studio",
          description: "Generative Art on Kaspa",
          url: window.location.origin,
          icons: [window.location.origin + "/icon.png"]
        }
      });
      
      signClient.on("session_delete", function() { disconnect(); });
      signClient.on("session_expire", function() { disconnect(); });
      
      var sessions = signClient.session.getAll();
      if (sessions.length > 0) {
        session = sessions[0];
        await fetchAccountInfo();
      }
    } catch (err) {
      console.error('WC init failed:', err);
    }
    return signClient;
  }

  async function connect() {
    state = "connecting";
    if (typeof window.updateWalletUI === "function") window.updateWalletUI();
    await init();
    if (!signClient) {
      alert('WalletConnect is still loading. Please try again in a moment.');
      return false;
    }
    
    try {
      var connectResult = await signClient.connect({
        requiredNamespaces: {
          kaspa: {
            chains: [getKaspaChainId()],
            methods: ["kaspa_getAccounts", "kaspa_getPublicKey"],
            events: []
          }
        }
      });

      if (connectResult.uri) {
        var kaspireLink = "https://kaspire.kaslab.space/kaspire/wc?uri=" + encodeURIComponent(connectResult.uri);
        var kaspireIntent = "intent://wc?uri=" + encodeURIComponent(connectResult.uri) +
          "#Intent;scheme=kaspire;package=space.kaspire.wallet;" +
          "S.browser_fallback_url=" + encodeURIComponent(kaspireLink) + ";end";

        if (/Android/i.test(navigator.userAgent)) {
          window.location.assign(kaspireIntent);
        } else {
          showQrCode(kaspireLink);
        }
      }

      session = await connectResult.approval();
      await fetchAccountInfo();
      return true;
    } catch (err) {
      console.error('Connection failed:', err);
      state = "error";
      if (typeof window.updateWalletUI === 'function') window.updateWalletUI();
      if (err.message && err.message.toLowerCase().indexOf('cancelled') === -1 && err.message.toLowerCase().indexOf('rejected') === -1) {
        alert('Connection failed: ' + err.message);
      }
      return false;
    }
  }

  async function fetchAccountInfo() {
    if (!session || !signClient) return;
    try {
      var pubKeyRes = await signClient.request({
        topic: session.topic,
        chainId: getKaspaChainId(),
        request: { method: "kaspa_getPublicKey", params: {} }
      });
      if (pubKeyRes) {
        pubkey = typeof pubKeyRes === 'string' ? pubKeyRes : (pubKeyRes.publicKey || pubKeyRes.result || '');
      }

      var accRes = await signClient.request({
        topic: session.topic,
        chainId: getKaspaChainId(),
        request: { method: "kaspa_getAccounts", params: {} }
      });
      if (accRes && accRes.length > 0) {
        address = accRes[0];
      }
      
      connected = true;
      if (address && address.startsWith("kaspatest:")) {
        network = "testnet";
        state = "wrongnet";
      } else {
        network = "mainnet";
        state = "connected";
      }
      if (typeof window.updateWalletUI === 'function') window.updateWalletUI();
    } catch (err) {
      console.error('Failed to fetch account info:', err);
    }
  }

  function showQrCode(link) {
    if (!qrContainer) {
      qrContainer = document.createElement('div');
      qrContainer.id = 'kaspire-qr-modal';
      qrContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;flex-direction:column;';
      
      var qrBox = document.createElement('div');
      qrBox.style.cssText = 'background:#fff;padding:24px;border-radius:12px;text-align:center;max-width:90%;';
      
      var qrCanvas = document.createElement('div');
      qrCanvas.id = 'qr-art';
      qrCanvas.style.cssText = 'width:256px;margin:0 auto;';
      qrBox.appendChild(qrCanvas);
      
      var info = document.createElement('p');
      info.textContent = 'Scan with Kaspire Wallet';
      info.style.cssText = 'margin-top:16px;color:#000;font-family:sans-serif;font-weight:bold;font-size:16px;';
      qrBox.appendChild(info);

      var closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.style.cssText = 'margin-top:12px;padding:8px 16px;cursor:pointer;background:#0b0d10;color:#fff;border:none;border-radius:6px;';
      closeBtn.onclick = hideQrCode;
      qrBox.appendChild(closeBtn);

      qrContainer.appendChild(qrBox);
      qrContainer.onclick = function(e) { if (e.target === qrContainer) hideQrCode(); };
      document.body.appendChild(qrContainer);
      
      if (!renderQr(qrCanvas, link)) {
        qrCanvas.innerHTML = '<p style="color:#000;">QR unavailable — copy this link:</p><p style="color:#000;word-break:break-all;font-size:12px;">' + link + '</p>';
      }
    } else {
      qrContainer.style.display = 'flex';
      var qrArt = qrContainer.querySelector('#qr-art');
      if (qrArt) renderQr(qrArt, link);
    }
  }

  function hideQrCode() {
    if (qrContainer) qrContainer.style.display = 'none';
  }

  function disconnect() {
    connected = false;
    state = "idle";
    network = null;
    pubkey = null;
    address = null;
    session = null;
    hideQrCode();
    if (typeof window.updateWalletUI === 'function') window.updateWalletUI();
  }

  function isConnected() { return connected; }
  function getPubkey() { return pubkey; }
  function getAddress() { return address; }

  
  // --- Node Error Translator ---
  var NODE_ERR = [
    [/orphan where orphan is disallowed/i, 'Node hasn\'t seen the parent tx yet. Wait ~10s and retry — funds are safe.'],
    [/already in the mempool/i,            'Already submitted. Waiting for a block…'],
    [/required (?:fee|amount) of (\d+)/i,  m => 'Adjusting fee to ' + ((BigInt(m[1]) * 11n / 10n + 1n) / 100000000n) + ' KAS…'],
    [/sequence locks/i,                    'Escrow not expired yet.'],
    [/script units exceeded/i,             'REST dropped compute_budget — routing via wRPC…'],
  ];
  function translateError(msg) {
    for (var i = 0; i < NODE_ERR.length; i++) {
      var m = msg.match(NODE_ERR[i][0]);
      if (m) return typeof NODE_ERR[i][1] === 'function' ? NODE_ERR[i][1](m) : NODE_ERR[i][1];
    }
    return msg;
  }

  // --- Pre-Sign Review Sheet (Exact Covenant Math) ---
  function computeSplit(price, bips) {
    var p = BigInt(price);
    var b = BigInt(bips);
    var roy = (p * b) / 10000n; // floor division, identical to Silverscript int
    return { price: p, royalty: roy, ownerNet: p - roy };
  }

  return { 
    init: init, connect: connect, disconnect: disconnect, 
    isConnected: isConnected, getPubkey: getPubkey, getAddress: getAddress,
    getState: function() { return state; },
    getNetwork: function() { return network; },
    translateError: translateError,
    computeSplit: computeSplit 
  };
})();

// --- TX LIFECYCLE (appended: generators inline studio-wallet.js) ---
var TxLifecycle = (function() {
  var rail = null;
  var toastContainer = null;

  function init() {
    if (rail) return;
    // Toast Container (top right)
    toastContainer = document.createElement('div');
    toastContainer.id = 'tx-toasts';
    toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(toastContainer);

    // Bottom Rail
    rail = document.createElement('div');
    rail.id = 'tx-rail';
    rail.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;background:var(--surface, #12141a);border-top:1px solid var(--border, #23282e);padding:16px;display:none;align-items:center;justify-content:center;gap:12px;font-family:var(--font-mono, monospace);z-index:9999;box-shadow:0 -4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(rail);
    
    if (!document.getElementById('tx-rail-styles')) {
      var style = document.createElement('style');
      style.id = 'tx-rail-styles';
      style.textContent = `
        .rail-step { padding: 4px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase; opacity: 0.4; transition: all 0.3s; }
        .rail-step.done { opacity: 1; color: var(--success, #7fd1ae); }
        .rail-step.active { opacity: 1; background: var(--accent-glow, rgba(73, 197, 177, 0.15)); color: var(--accent, #49c5b1); font-weight: bold; }
        .rail-arrow { opacity: 0.2; font-size: 12px; }
        .rail-msg { margin-left: 16px; font-size: 13px; color: var(--text-dim, #8a9199); font-family: var(--font-ui, sans-serif); }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `;
      document.head.appendChild(style);
    }
  }

  function setStep(step, msg) {
    init();
    rail.style.display = 'flex';
    var steps = ['building', 'signing', 'broadcasting', 'mempool', 'confirmed'];
    var idx = steps.indexOf(step);
    
    var html = steps.map(function(s, i) {
      var cls = i < idx ? 'done' : (i === idx ? 'active' : 'pending');
      return '<span class="rail-step ' + cls + '">' + s + '</span>';
    }).join('<span class="rail-arrow">→</span>');
    
    rail.innerHTML = html + '<span class="rail-msg">' + (msg || '') + '</span>';
  }

  function hide() {
    if (rail) rail.style.display = 'none';
  }

  function toast(msg, type) { // type: 'info', 'success', 'error'
    init();
    var t = document.createElement('div');
    var colors = { info: 'var(--accent, #49c5b1)', success: 'var(--success, #7fd1ae)', error: '#ff6b6b' };
    t.style.cssText = 'background:var(--surface-2, #1a1c24);color:#fff;padding:12px 16px;border-radius:8px;border-left:4px solid ' + (colors[type] || colors.info) + ';font-family:var(--font-ui, sans-serif);font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.4);max-width:320px;animation:fadeIn 0.3s ease-out;pointer-events:auto;';
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(function() {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s';
      setTimeout(function() { t.remove(); }, 300);
    }, 5000);
  }

  function error(errMsg) {
    var translated = window.ReliksWallet ? ReliksWallet.translateError(errMsg) : errMsg;
    toast(translated, 'error');
    setStep('building', 'Transaction failed'); // Reset to start but show error state via toast
    setTimeout(hide, 4000);
  }

  return { init: init, setStep: setStep, hide: hide, toast: toast, error: error };
})();

