var ReliksWallet = (function() {
  var connected = false;
  var pubkey = null;
  var address = null;
  var signClient = null;
  var session = null;
  var projectId = '2f5b63e20302f9ce15971f44ff1cdfca';
  var qrContainer = null;

  async function init() {
    if (signClient) return signClient;
    if (!window.SignClient) {
      console.warn('SignClient not loaded yet');
      return null;
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
    await init();
    if (!signClient) {
      alert('WalletConnect is still loading. Please try again in a moment.');
      return false;
    }
    
    try {
      var connectResult = await signClient.connect({
        requiredNamespaces: {
          kaspa: {
            chains: ["kaspa:mainnet"],
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
        chainId: "kaspa:mainnet",
        request: { method: "kaspa_getPublicKey", params: {} }
      });
      if (pubKeyRes) {
        pubkey = typeof pubKeyRes === 'string' ? pubKeyRes : (pubKeyRes.publicKey || pubKeyRes.result || '');
      }

      var accRes = await signClient.request({
        topic: session.topic,
        chainId: "kaspa:mainnet",
        request: { method: "kaspa_getAccounts", params: {} }
      });
      if (accRes && accRes.length > 0) {
        address = accRes[0];
      }
      
      connected = true;
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
      
      var qrCanvas = document.createElement('canvas');
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
      
      if (window.QRCode) {
        window.QRCode.toCanvas(qrCanvas, link, { width: 256, margin: 2 });
      } else {
        qrBox.innerHTML = '<p style="color:#000;">Loading QR Code...</p><p style="color:#000;word-break:break-all;font-size:12px;">' + link + '</p>';
      }
    } else {
      qrContainer.style.display = 'flex';
      var qrCanvas = qrContainer.querySelector('canvas');
      if (window.QRCode && qrCanvas) {
        window.QRCode.toCanvas(qrCanvas, link, { width: 256, margin: 2 });
      }
    }
  }

  function hideQrCode() {
    if (qrContainer) qrContainer.style.display = 'none';
  }

  function disconnect() {
    connected = false;
    pubkey = null;
    address = null;
    session = null;
    hideQrCode();
    if (typeof window.updateWalletUI === 'function') window.updateWalletUI();
  }

  function isConnected() { return connected; }
  function getPubkey() { return pubkey; }
  function getAddress() { return address; }

  return { 
    init: init, connect: connect, disconnect: disconnect, 
    isConnected: isConnected, getPubkey: getPubkey, getAddress: getAddress 
  };
})();
