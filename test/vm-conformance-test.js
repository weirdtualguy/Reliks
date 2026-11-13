// Runs the Reliks-VM conformance suites inside `npm test`:
// 1) JS interpreter against all 142 vectors in v13/vm/vectors.json (v13/vm/check.js)
// 2) C99 interpreter (v13/vm/rvm.c) compiled with -O2 -std=c99 against all 135 program cases (v13/vm/check3.js)
// 3) C99 interpreter compiled with -fsanitize=address,undefined (when supported by cc) against all 135 program cases
// 4) SDK offline protocol, claim (+ signed ownership challenge), provenance, engine-kind, escrow, lane, and submit safety suites
// 5) F-02 defense-in-depth check (zero innerHTML in web/reliks-gallery-runtime.js)
// 6) RVM Lens (cli/reliks-lens-vm.js) gate suite + PC_PRIV refusal guard
// 7) Offline Provenance Bundles (tools/gen-provenance-bundle.js --verify)
// 8) Site VM series build & anchor verification (tools/gen-site.js with engine_lang=2 Reliks-VM series)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' (' + detail + ')' : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// 1) JS RVM vector suite (142 vectors)
{
  const r = cp.spawnSync(process.execPath, [path.join(root, 'v13', 'vm', 'check.js')], { cwd: path.join(root, 'v13', 'vm'), encoding: 'utf8' });
  const line = String(r.stdout || '').trim().split('\n').pop() || '';
  ok('RVM JS interpreter conformance (v13/vm/check.js)', r.status === 0 && /142 passed, 0 failed/.test(line), line);
}

// 2) C99 RVM vector suite (135 program vectors) + ASan/UBSan
{
  const ccProbe = cp.spawnSync('cc', ['--version'], { encoding: 'utf8' });
  if (!ccProbe.error && ccProbe.status === 0) {
    const bdir = path.join(root, '.build-vm-test-' + process.pid);
    fs.mkdirSync(bdir, { recursive: true });
    try {
      const bin = path.join(bdir, 'rvm3');
      const c1 = cp.spawnSync('cc', ['-O2', '-std=c99', '-o', bin, path.join(root, 'v13', 'vm', 'rvm.c')], { encoding: 'utf8' });
      const r1 = c1.status === 0 ? cp.spawnSync(process.execPath, [path.join(root, 'v13', 'vm', 'check3.js'), bin], { encoding: 'utf8' }) : { status: 1, stdout: c1.stderr };
      const l1 = String(r1.stdout || '').trim().split('\n').pop() || '';
      ok('RVM C99 interpreter conformance (v13/vm/check3.js)', r1.status === 0 && /135 passed, 0 failed/.test(l1), l1);

      const binSan = path.join(bdir, 'rvm3_san');
      const c2 = cp.spawnSync('cc', ['-O2', '-std=c99', '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-o', binSan, path.join(root, 'v13', 'vm', 'rvm.c')], { encoding: 'utf8' });
      if (c2.status === 0 && fs.existsSync(binSan)) {
        const r2 = cp.spawnSync(process.execPath, [path.join(root, 'v13', 'vm', 'check3.js'), binSan], { encoding: 'utf8' });
        const l2 = String(r2.stdout || '').trim().split('\n').pop() || '';
        ok('RVM C99 under ASan/UBSan/LSan (135 program vectors)', r2.status === 0 && /135 passed, 0 failed/.test(l2), l2);
      }
    } finally {
      fs.rmSync(bdir, { recursive: true, force: true });
    }
  } else {
    console.log('SKIP RVM C99 conformance (cc not installed)');
  }
}

// 3) SDK offline suites (zero external dependencies)
for (const s of ['sdk/test-protocol.js', 'sdk/test-engine.js', 'sdk/test-vm-args.js', 'sdk/test-escrow.js', 'sdk/test-claim.js', 'sdk/test-provenance.js', 'sdk/test-lane.js', 'sdk/test-submit.js', 'sdk/test-lookup.js', 'sdk/test-submit-node.js', 'sdk/test-tipage.js']) {
  const r = cp.spawnSync(process.execPath, [path.join(root, s)], { cwd: root, encoding: 'utf8' });
  const last = String(r.stdout || '').trim().split('\n').pop() || '';
  ok('SDK suite ' + s, r.status === 0, last);
}

// 4) F-02 defense-in-depth guard: web/reliks-gallery-runtime.js must not use innerHTML
{
  const gsrc = fs.readFileSync(path.join(root, 'web', 'reliks-gallery-runtime.js'), 'utf8');
  const clean = gsrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  ok('F-02 guard: web/reliks-gallery-runtime.js has zero innerHTML assignments', !/\.innerHTML\b/.test(clean));
}

// 5) Reliks-VM Lens (cli/reliks-lens-vm.js) + PC_PRIV guard
{
  const lens = require(path.join(root, 'cli', 'reliks-lens-vm.js'));
  const res = lens.runLensVm(path.join(root, 'v13', 'vm', 'asm-corpus', 'dagcity_clean.txt'), { serials: 8, noWrite: true });
  ok('cli/reliks-lens-vm.js passes on dagcity_clean.txt', res.ok && res.worstStats.fuel > 0 && res.bytes === 1567, 'fuel ' + res.worstStats.fuel + ', elems ' + res.worstStats.elems);
  const privRun = cp.spawnSync(process.execPath, [path.join(root, 'cli', 'reliks-lens-vm.js'), path.join(root, 'v13', 'vm', 'asm-corpus', 'dagcity_clean.txt')], { env: Object.assign({}, process.env, { PC_PRIV: '11'.repeat(32) }), encoding: 'utf8' });
  ok('cli/reliks-lens-vm.js refuses to run when PC_PRIV is exported', privRun.status !== 0 && /LENS SECURITY/.test(String(privRun.stderr)));
}

// 6) Offline Provenance Bundles (tools/gen-provenance-bundle.js --verify)
{
  const r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'gen-provenance-bundle.js'), '--verify'], { cwd: root, encoding: 'utf8' });
  ok('Offline provenance bundles verify (v12 JS + v13 Reliks-VM)', r.status === 0 && /PASS data\/provenance-v12-genesis\.json/.test(r.stdout) && /PASS v13\/provenance-v13-demo\.json/.test(r.stdout));
}

// 7) Site VM series support (tools/gen-site.js with engine_lang=2 Reliks-VM series)
{
  const anchors = JSON.parse(fs.readFileSync(path.join(root, 'data', 'mainnet-anchors.json'), 'utf8'));
  const b13 = JSON.parse(fs.readFileSync(path.join(root, 'v13', 'provenance-v13-demo.json'), 'utf8'));
  anchors.series.push({
    id: b13.series.id,
    title: b13.series.title,
    laneCovenantId: b13.series.laneCovenantId,
    genesisTxId: b13.series.genesisTxId,
    programHash: b13.series.program_hash,
    renderHash: b13.series.render_hash,
    artist: b13.series.artist,
    engine_lang: 2,
    programHex: b13.series.program_hex,
    editions: b13.editions.map(e => ({ index: e.index, serial: e.serial, covenantId: e.covenantId, mintTxId: e.mintTxId, outputIndex: e.outputIndex, ownerAtMint: e.ownerAtMint, lineage: e.state.lineage, sales: Number(e.state.sales) }))
  });
  const tmpAnchors = path.join(os.tmpdir(), 'reliks-vm-anchors-' + process.pid + '.json');
  const tmpOut = path.join(os.tmpdir(), 'reliks-vm-site-' + process.pid + '.html');
  fs.writeFileSync(tmpAnchors, JSON.stringify(anchors));
  const rGood = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'gen-site.js')], { env: Object.assign({}, process.env, { RELIKS_ANCHORS: tmpAnchors, RELIKS_OUT: tmpOut }), encoding: 'utf8' });
  const builtHtml = fs.existsSync(tmpOut) ? fs.readFileSync(tmpOut, 'utf8') : '';
  ok('tools/gen-site.js builds and verifies a Reliks-VM series (engine_lang=2)', rGood.status === 0 && builtHtml.includes(b13.series.program_hash) && builtHtml.includes(b13.series.program_hex));

  // Verify gen-site.js fails closed if a VM series renderHash is tampered with
  anchors.series[1].renderHash = '00'.repeat(32);
  fs.writeFileSync(tmpAnchors, JSON.stringify(anchors));
  const rBad = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'gen-site.js')], { env: Object.assign({}, process.env, { RELIKS_ANCHORS: tmpAnchors, RELIKS_OUT: tmpOut }), encoding: 'utf8' });
  ok('tools/gen-site.js fails closed on mismatched Reliks-VM renderHash', rBad.status !== 0 && /anchor mismatch/.test(String(rBad.stderr)));
  try { fs.unlinkSync(tmpAnchors); fs.unlinkSync(tmpOut); } catch (e) {}
}

console.log('vm-conformance-test: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
