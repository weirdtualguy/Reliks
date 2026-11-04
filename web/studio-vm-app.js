/* Reliks-VM Studio: assemble, render, download. Needs ReliksBlake2b, RVM, RvmAsm and window.STUDIO (templates). No network. */
(function () {
  'use strict';
  var B = ReliksBlake2b.blake2b, enc = new TextEncoder(), D = window.STUDIO;
  var $ = function (id) { return document.getElementById(id); };
  var ed = $('ed'), ser = $('ser'), lin = $('lin'), wr = $('wr'), wv = $('wv'), tpl = $('tpl'), st = $('st'), img = $('img'), info = $('info'), nm = $('name');
  var prog = null, timer = 0;
  function hex(u) { var s = ''; for (var i = 0; i < u.length; i++) s += ('0' + u[i].toString(16)).slice(-2); return s; }
  function unhex(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function say(msg, bad) { st.textContent = msg; st.className = bad ? 'bad' : 'ok'; }
  function run() {
    var s = ser.value.trim() || '1', l = lin.value.trim().toLowerCase();
    wv.textContent = wr.value;
    if (!/^\d{1,19}$/.test(s) || BigInt(s) >= BigInt('9223372036854775808')) { say('Serial must be a whole number below 2^63.', true); return; }
    if (!/^[0-9a-f]{64}$/.test(l)) { say('Lineage must be 64 hex characters.', true); return; }
    try { prog = RvmAsm.assemble(ed.value); } catch (e) { prog = null; say('Assemble error: ' + e.message, true); return; }
    try {
      var hi = RVM.hostInputs(B, s, unhex(l), Number(wr.value));
      var svg = RVM.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      info.textContent = 'program       ' + prog.length + ' B\nprogram_hash  ' + hex(B(prog, 32)) + '\nrender_hash   ' + hex(B(enc.encode(svg), 32)) + '\nsvg           ' + svg.length + ' B\nwear          ' + hi.wear + ' / 255\npatina        ' + hi.pat + ' / 63';
      say('Rendered.');
    } catch (e) { say('Render fault: ' + (e.code || e.message), true); }
  }
  function later() { clearTimeout(timer); timer = setTimeout(run, 600); }
  function download(fn, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = fn; document.body.appendChild(a); a.click(); a.remove(); }
  function slug() { return (nm.value || 'my-program').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'my-program'; }
  $('load').addEventListener('click', function () { ed.value = D.templates[tpl.value] || D.templates.starter; run(); });
  $('rs').addEventListener('click', function () { ser.value = String(Math.floor(Math.random() * 4294967296)); run(); });
  $('rl').addEventListener('click', function () { var o = new Uint8Array(32); crypto.getRandomValues(o); lin.value = hex(o); run(); });
  $('go').addEventListener('click', run);
  $('dlhex').addEventListener('click', function () { run(); if (prog) download(slug() + '.hex', hex(prog) + '\n'); });
  $('dlsrc').addEventListener('click', function () { download(slug() + '.rvm.txt', ed.value); });
  ed.addEventListener('input', later); ser.addEventListener('change', run); lin.addEventListener('change', run); wr.addEventListener('input', run);
  ed.value = D.templates.starter; run();
})();
