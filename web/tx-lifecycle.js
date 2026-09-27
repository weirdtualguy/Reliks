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
