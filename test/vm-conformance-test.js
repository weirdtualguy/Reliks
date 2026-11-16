// Runs the Reliks-VM conformance suites inside `npm test`:
// 1) JS interpreter against all 142 vectors in vm/vectors.json (vm/check.js)
// 2) C99 interpreter (vm/rvm.c) compiled with -O2 -std=c99 against all 135 program cases (vm/check3.js)
// 3) C99 interpreter compiled with -fsanitize=address,undefined against all 135 program cases
// 4) SDK offline protocol, claim (+ signed ownership challenge), provenance, engine-kind, escrow, lane, and submit safety suites
// 5) Defense-in-depth check (zero innerHTML in web/reliks-gallery-runtime.js)
// 6) Reliks-VM Lens (cli/reliks-lens.js) gate suite + PC_PRIV refusal guard
// 7) Offline Provenance Bundle (tools/gen-provenance-bundle.js --verify)
// 8) Site VM series build & anchor verification (tools/gen-site.js with Reliks-VM series)
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
  const r = cp.spawnSync(process.execPath, [path.join(root, 'vm', 'check.js')], { cwd: path.join(root, 'vm'), encoding: 'utf8' });
  const line = String(r.stdout || '').trim().split('\n').pop() || '';
  ok('RVM JS interpreter conformance (vm/check.js)', r.status === 0 && /142 passed, 0 failed/.test(line), line);
}

// 2) C99 RVM vector suite (135 program vectors) + ASan/UBSan
{
  const ccProbe = cp.spawnSync('cc', ['--version'], { encoding: 'utf8' });
  if (!ccProbe.error && ccProbe.status === 0) {
    const bdir = path.join(root, '.build-vm-test-' + process.pid);
    fs.mkdirSync(bdir, { recursive: true });
    try {
      const bin = path.join(bdir, 'rvm3');
      const c1 = cp.spawnSync('cc', ['-O2', '-std=c99', '-o', bin, path.join(root, 'vm', 'rvm.c')], { encoding: 'utf8' });
      const r1 = c1.status === 0 ? cp.spawnSync(process.execPath, [path.join(root, 'vm', 'check3.js'), bin], { encoding: 'utf8' }) : { status: 1, stdout: c1.stderr };
      const l1 = String(r1.stdout || '').trim().split('\n').pop() || '';
      ok('RVM C99 interpreter conformance (vm/check3.js)', r1.status === 0 && /135 passed, 0 failed/.test(l1), l1);

      const binSan = path.join(bdir, 'rvm3_san');
      const c2 = cp.spawnSync('cc', ['-O2', '-std=c99', '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-o', binSan, path.join(root, 'vm', 'rvm.c')], { encoding: 'utf8' });
      if (c2.status === 0 && fs.existsSync(binSan)) {
        const r2 = cp.spawnSync(process.execPath, [path.join(root, 'vm', 'check3.js'), binSan], { encoding: 'utf8' });
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

// 4) Defense-in-depth guard: web/reliks-gallery-runtime.js must not use innerHTML
{
  const gsrc = fs.readFileSync(path.join(root, 'web', 'reliks-gallery-runtime.js'), 'utf8');
  const clean = gsrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  ok('Guard: web/reliks-gallery-runtime.js has zero innerHTML assignments', !/\.innerHTML\b/.test(clean));
}

// 5) Reliks-VM Lens (cli/reliks-lens.js) + PC_PRIV guard
{
  const lens = require(path.join(root, 'cli', 'reliks-lens.js'));
  const res = lens.runLensVm(path.join(root, 'vm', 'asm-corpus', 'dagcity_clean.txt'), { serials: 8, noWrite: true });
  ok('cli/reliks-lens.js passes on dagcity_clean.txt', res.ok && res.worstStats.fuel > 0 && res.bytes === 1567, 'fuel ' + res.worstStats.fuel + ', elems ' + res.worstStats.elems);
  const privRun = cp.spawnSync(process.execPath, [path.join(root, 'cli', 'reliks-lens.js'), path.join(root, 'vm', 'asm-corpus', 'dagcity_clean.txt')], { env: Object.assign({}, process.env, { PC_PRIV: '11'.repeat(32) }), encoding: 'utf8' });
  ok('cli/reliks-lens.js refuses to run when PC_PRIV is exported', privRun.status !== 0 && /LENS SECURITY/.test(String(privRun.stderr)));
}

// 6) Offline Provenance Bundle (tools/gen-provenance-bundle.js --verify)
{
  const r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'gen-provenance-bundle.js'), '--verify'], { cwd: root, encoding: 'utf8' });
  ok('Offline provenance bundle verifies (data/provenance-demo.json)', r.status === 0 && /PASS data\/provenance-demo\.json/.test(r.stdout));
}

// 7) Site VM series support (tools/gen-site.js with Reliks-VM series)
{
  const anchors = JSON.parse(fs.readFileSync(path.join(root, 'data', 'mainnet-anchors.json'), 'utf8'));
  const bDemo = JSON.parse(fs.readFileSync(path.join(root, 'data', 'provenance-demo.json'), 'utf8'));
  anchors.series.push({
    id: bDemo.series.id,
    title: bDemo.series.title,
    laneCovenantId: bDemo.series.laneCovenantId,
    genesisTxId: bDemo.series.genesisTxId,
    programHash: bDemo.series.program_hash,
    renderHash: bDemo.series.render_hash,
    artist: bDemo.series.artist,
    engine_lang: 2,
    programHex: bDemo.series.program_hex,
    editions: bDemo.editions.map((e) => ({ index: e.index, serial: e.serial, covenantId: e.covenantId, mintTxId: e.mintTxId, outputIndex: e.outputIndex, ownerAtMint: e.ownerAtMint, lineage: e.state.lineage, sales: Number(e.state.sales) }))
  });
  const tmpAnchors = path.join(os.tmpdir(), 'reliks-vm-anchors-' + process.pid + '.json');
  const tmpOut = path.join(os.tmpdir(), 'reliks-vm-site-' + process.pid + '.html');
  fs.writeFileSync(tmpAnchors, JSON.stringify(anchors));
  const rGood = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'gen-site.js')], { env: Object.assign({}, process.env, { RELIKS_ANCHORS: tmpAnchors, RELIKS_OUT: tmpOut }), encoding: 'utf8' });
  const builtHtml = fs.existsSync(tmpOut) ? fs.readFileSync(tmpOut, 'utf8') : '';
  ok('tools/gen-site.js builds and verifies a Reliks-VM series (engine_lang=2)', rGood.status === 0 && builtHtml.includes(bDemo.series.program_hash) && builtHtml.includes(bDemo.series.program_hex));

  anchors.series[0].renderHash = '00'.repeat(32);
  fs.writeFileSync(tmpAnchors, JSON.stringify(anchors));
  const rBad = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'gen-site.js')], { env: Object.assign({}, process.env, { RELIKS_ANCHORS: tmpAnchors, RELIKS_OUT: tmpOut }), encoding: 'utf8' });
  ok('tools/gen-site.js fails closed on mismatched Reliks-VM renderHash', rBad.status !== 0 && /anchor mismatch/.test(String(rBad.stderr)));
  try { fs.unlinkSync(tmpAnchors); fs.unlinkSync(tmpOut); } catch (e) {}
}

console.log('vm-conformance-test: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
