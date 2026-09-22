// studio-wallet.js - Kaspire wallet integration for Reliks Studio
// Detects the browser extension, connects on demand, exports pubkey to series JSON.
var ReliksWallet = (function() {
  var connected = false;
  var pubkey = null;
  var address = null;
  function detect() {
    return typeof window !== 'undefined' && window.kaspa && typeof window.kaspa.connect === 'function';
  }
  function connect() {
    if (!detect()) {
      alert('Kaspire wallet extension not detected.\n\nInstall from: https://chrome.google.com/webstore/detail/kaspire/kcpggeijhdmhkkjhbglfpkmjpdjibhln\n\nOr fill pubkeys manually in the exported series.json.');
      return Promise.resolve(false);
    }
    return window.kaspa.connect().then(function(acc) {
      if (acc && acc.publicKey) {
        pubkey = acc.publicKey;
        address = acc.address || '';
        connected = true;
        return true;
      }
      return false;
    }).catch(function(err) {
      console.error('Wallet connect failed:', err);
      alert('Wallet connection rejected or failed: ' + (err.message || err));
      return false;
    });
  }
  function disconnect() {
    connected = false;
    pubkey = null;
    address = null;
  }
  function isConnected() { return connected; }
  function getPubkey() { return pubkey; }
  function getAddress() { return address; }
  return { detect: detect, connect: connect, disconnect: disconnect, isConnected: isConnected, getPubkey: getPubkey, getAddress: getAddress };
})();
