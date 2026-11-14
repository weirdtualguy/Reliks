/* Reliks-VM Studio: assemble, render, run gates, download. Needs ReliksBlake2b, RVM, RvmAsm and window.STUDIO (templates). No network. */
(function () {
  'use strict';
  var B = ReliksBlake2b.blake2b, enc = new TextEncoder(), D = window.STUDIO;
  var $ = function (id) { return document.getElementById(id); };
  var ed = $('ed'), ser = $('ser'), lin = $('lin'), wr = $('wr'), wv = $('wv'), tpl = $('tpl'), st = $('st'), img = $('img'), info = $('info'), nm = $('name'), gatesOut = $('gates-out');
  var prog = null, timer = 0, BAKE_CAP = (RVM.limits && RVM.limits.BAKE_CAP) || 25641;
  function hex(u) { var s = ''; for (var i = 0; i < u.length; i++) s += ('0' + u[i].toString(16)).slice(-2); return s; }
  function unhex(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function say(msg, bad) { st.textContent = msg; st.className = bad ? 'bad' : 'ok'; }
  function parseSourceOrHex(raw) {
    var trimmed = String(raw || '').trim(), compact = trimmed.replace(/\s+/g, '');
    if (compact.length >= 18 && compact.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(compact) && /^52564d01/i.test(compact)) {
      return unhex(compact.toLowerCase());
    }
    return RvmAsm.assemble(raw);
  }
  function run() {
    var s = ser.value.trim() || '1', l = lin.value.trim().toLowerCase();
    wv.textContent = wr.value;
    if (!/^\d{1,19}$/.test(s) || BigInt(s) >= BigInt('9223372036854775808')) { say('Serial must be a whole number below 2^63.', true); return; }
    if (!/^[0-9a-f]{64}$/.test(l)) { say('Lineage must be 64 hex characters.', true); return; }
    try { prog = parseSourceOrHex(ed.value); } catch (e) { prog = null; say('Assemble error: ' + e.message, true); return; }
    try {
      var hi = RVM.hostInputs(B, s, unhex(l), Number(wr.value)), stats = {};
      var svg = RVM.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear, stats);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      info.textContent = 'program       ' + prog.length + ' / ' + BAKE_CAP + ' B (PUSHDATA2 bake cap)\nprogram_hash  ' + hex(B(prog, 32)) + '\nrender_hash   ' + hex(B(enc.encode(svg), 32)) + '\nsvg           ' + svg.length + ' / ' + RVM.limits.MAX_SVG + ' B\nfuel          ' + stats.fuel + ' / ' + RVM.limits.FUEL_MAX + '\nelements      ' + stats.elems + ' / ' + RVM.limits.MAX_ELEMS + '\nmax_stack     ' + stats.max_stack + ' / ' + RVM.limits.STACK_MAX + '\nwear          ' + hi.wear + ' / 255\npatina        ' + hi.pat + ' / 63';
      say('Rendered.');
    } catch (e) { say('Render fault: ' + (e.code || e.message), true); }
  }
  function runGates() {
    run();
    if (!gatesOut) return false;
    if (!prog) { gatesOut.textContent = 'FAIL V0 assemble: fix syntax error first.'; return false; }
    var lines = [], allOk = true;
    function chk(label, ok, detail) {
      if (!ok) allOk = false;
      lines.push((ok ? 'PASS ' : 'FAIL ') + label + (detail ? ' | ' + detail : ''));
    }
    chk('V1 size <= PUSHDATA2 baking cap', prog.length <= BAKE_CAP, prog.length + ' / ' + BAKE_CAP + ' B');
    var anchorOk = false, anchorHash = '';
    try {
      var hi1 = RVM.hostInputs(B, '1', new Uint8Array(32), 0);
      var svg1 = RVM.render(prog, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
      anchorHash = hex(B(enc.encode(svg1), 32)).slice(0, 16) + '…';
      anchorOk = svg1.indexOf('<svg') === 0 && /<\/svg>$/.test(svg1);
    } catch (e) { anchorHash = e.code || e.message; }
    chk('V2 anchor render (serial=1, lineage=0, sales=0)', anchorOk, anchorHash);
    var detOk = true;
    try {
      var hiD = RVM.hostInputs(B, '42', new Uint8Array(32), 0);
      var a = RVM.render(prog, hiD.lanes, hiD.serial32, hiD.pat, hiD.wear);
      var b = RVM.render(prog, hiD.lanes, hiD.serial32, hiD.pat, hiD.wear);
      detOk = a === b;
    } catch (e) { detOk = false; }
    chk('V3 determinism (double-render serial 42)', detOk);
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
    chk('V4 corner sweep (' + (sers.length * corners.length) + ' renders across serials x pat/wear)', faults === 0, faults ? firstFault : '0 faults');
    chk('V5 worst-case headroom', faults === 0, 'fuel ' + maxFuel + '/' + RVM.limits.FUEL_MAX + ' | elems ' + maxElems + '/' + RVM.limits.MAX_ELEMS + ' | svg ' + maxSvg + '/' + RVM.limits.MAX_SVG + ' B | stack ' + maxSt + '/' + RVM.limits.STACK_MAX);
    gatesOut.textContent = lines.join('\n');
    say(allOk ? 'All VM gates passed.' : 'VM gates failed: see report below.', !allOk);
    return allOk;
  }
  function later() { clearTimeout(timer); timer = setTimeout(run, 600); }
  function download(fn, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = fn; document.body.appendChild(a); a.click(); a.remove(); }
  function slug() { return (nm.value || 'my-program').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'my-program'; }
  $('load').addEventListener('click', function () { ed.value = D.templates[tpl.value] || D.templates.starter; if (gatesOut) gatesOut.textContent = ''; run(); });
  $('rs').addEventListener('click', function () { ser.value = String(Math.floor(Math.random() * 4294967296)); run(); });
  $('rl').addEventListener('click', function () { var o = new Uint8Array(32); crypto.getRandomValues(o); lin.value = hex(o); run(); });
  $('go').addEventListener('click', run);
  if ($('gates')) $('gates').addEventListener('click', runGates);
  $('dlhex').addEventListener('click', function () { if (runGates() && prog) download(slug() + '.hex', hex(prog) + '\n'); });
  $('dlsrc').addEventListener('click', function () { download(slug() + '.rvm.txt', ed.value); });
  ed.addEventListener('input', later); ser.addEventListener('change', run); lin.addEventListener('change', run); wr.addEventListener('input', run);
  ed.value = D.templates.starter; run();
})();
