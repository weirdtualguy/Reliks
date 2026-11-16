#!/usr/bin/env node
/* gen-provenance-bundle.js - Builds and verifies self-contained offline provenance bundles.
   A provenance bundle packages:
     - Series metadata & anchors (laneCovenantId, genesisTxId, artist, price, royalty_bips, engine_lang, program_hash, render_hash)
     - Full Reliks-VM bytecode (program_hex)
     - Contract template ABI (edition prefixHex, suffixHex, span, templateHashHex)
     - Complete per-edition state & render vectors (serial, serial32, lanes, lineage, sales, pat, wear, expectedSpk, render_hash)

   Usage:
     node tools/gen-provenance-bundle.js                     # generate data/provenance-demo.json
     node tools/gen-provenance-bundle.js --verify [file...]  # verify bundle(s) completely offline
*/
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { blake2b } = require(path.join(ROOT, 'web', 'blake2b.js'));
const ReliksChain = require(path.join(ROOT, 'web', 'reliks-chain.js'));
const RVM = require(path.join(ROOT, 'vm', 'rvm.js'));
const makeTemplates = require(path.join(ROOT, 'lib', 'reliks-templates.js'));

const enc = new TextEncoder();
const hx = (u) => Buffer.from(u).toString('hex');
const hashHex = (u) => hx(blake2b(u instanceof Uint8Array ? u : new Uint8Array(u), 32));

function buildDemoBundle() {
  const tpl = makeTemplates();
  const C = ReliksChain.init(tpl);
  const asm = require(path.join(ROOT, 'web', 'rvm-asm.js'));
  const cleanSrc = fs.readFileSync(path.join(ROOT, 'vm', 'asm-corpus', 'dagcity_clean.txt'), 'utf8');
  const prog = asm.assemble(cleanSrc);
  const progHex = hx(prog);
  const progHash = hashHex(prog);
  const hiAnchor = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
  const svgAnchor = RVM.render(prog, hiAnchor.lanes, hiAnchor.serial32, hiAnchor.pat, hiAnchor.wear);
  const renderHash = hashHex(enc.encode(svgAnchor));

  const genesisTxId = '029c14e56034353f671ab2abdec244d53dc65bf2298304a533e1d6529badb904';
  const laneCovId = 'cf1f1e60a7381496d886aaa5dddb2317c848202bdf1abdf9fe0accb7ba826d07';
  const artist = '25aafe02662998a62b4b4c1a887005ea8c604705c0a3cb29c3f63dfb85332f8b';
  const mintTxs = [
    { mintTxId: 'c7fc689f54f404e0a770ddb4d303b861592d1d508c779c545a64407fccf72846', sales: 0 },
    { mintTxId: '86860766c7a104e0a770ddb4d303b861592d1d508c779c545a64407fccf72847', sales: 1 },
    { mintTxId: '4fef24e96034353f671ab2abdec244d53dc65bf2298304a533e1d6529badb905', sales: 3 }
  ];

  const editions = mintTxs.map((m, i) => {
    const serial = String(i);
    let lineage = C.genesisLineage(laneCovId, i);
    for (let s = 0; s < m.sales; s++) lineage = C.advanceLineage(lineage, artist);
    const hi = RVM.hostInputs(blake2b, serial, new Uint8Array(Buffer.from(lineage, 'hex')), m.sales);
    const stats = {};
    const svg = RVM.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear, stats);
    const edRenderHash = hashHex(enc.encode(svg));
    const state = {
      ownerIdentifier: artist,
      identifierType: 0,
      price: '0',
      artist,
      royalty_bips: '500',
      program_hash: progHash,
      factory_covid: laneCovId,
      serial,
      lineage,
      sales: String(m.sales)
    };
    const expectedSpk = C.p2shSpk(C.editionRedeem(state));
    const covId = C.covenantIdGenesis(m.mintTxId, 1, [{ idx: 1, value: 100000000, script: expectedSpk }]);
    return {
      index: i,
      serial,
      serial32: hi.serial32,
      lanes: hi.lanes,
      pat: hi.pat,
      wear: hi.wear,
      covenantId: covId,
      mintTxId: m.mintTxId,
      outputIndex: 1,
      ownerAtMint: artist,
      state,
      expectedSpk,
      render_hash: edRenderHash,
      svg_bytes: svg.length,
      vm_stats: stats
    };
  });

  return {
    reliks_provenance_bundle: 1,
    generated_at: '2026-11-15',
    network: 'testnet-10',
    hrp: 'kaspatest',
    series: {
      id: 'dag-city-demo',
      title: 'DAG-City (Reliks-VM)',
      laneCovenantId: laneCovId,
      genesisTxId,
      artist,
      price: '100000000',
      royalty_bips: '500',
      mints_left_at_genesis: 8,
      next_serial_at_genesis: 0,
      engine_lang: 2,
      engine_kind: 'vm',
      program_hash: progHash,
      render_hash: renderHash,
      program_hex: progHex
    },
    templates: { edition: tpl.edition },
    editions
  };
}

function verifyBundle(bundle) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });
  if (!bundle || bundle.reliks_provenance_bundle !== 1 || !bundle.series || !Array.isArray(bundle.editions)) {
    add('bundle_format', false, 'missing reliks_provenance_bundle=1 or series/editions');
    return { ok: false, checks };
  }
  const s = bundle.series;
  add('bundle_format', true, s.id + ' (Reliks-VM, ' + bundle.editions.length + ' edition(s))');

  const progBytes = new Uint8Array(Buffer.from(s.program_hex, 'hex'));
  const gotPh = hashHex(progBytes);
  add('program_hash', gotPh === s.program_hash, gotPh.slice(0, 16) + '…');
  try {
    const hi1 = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
    const svg1 = RVM.render(progBytes, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
    const gotRh = hashHex(enc.encode(svg1));
    add('anchor_render_hash', gotRh === s.render_hash, gotRh.slice(0, 16) + '…');
  } catch (e) {
    add('anchor_render_hash', false, e.code || e.message);
  }

  const baseTpl = makeTemplates();
  const tpl = {
    factory: (bundle.templates && bundle.templates.factory) || baseTpl.factory,
    edition: (bundle.templates && bundle.templates.edition) || baseTpl.edition
  };
  const C = ReliksChain.init(tpl);
  const baseSerial = BigInt(s.next_serial_at_genesis || 0);

  for (const ed of bundle.editions) {
    const expSerial = String(baseSerial + BigInt(ed.index));
    add('ed#' + ed.index + '_serial', expSerial === String(ed.serial), 'serial ' + ed.serial);

    const rebSpk = C.p2shSpk(C.editionRedeem(ed.state));
    add('ed#' + ed.index + '_script_commitment', rebSpk === ed.expectedSpk, rebSpk.slice(0, 16) + '…');

    try {
      const hi = RVM.hostInputs(blake2b, ed.serial, new Uint8Array(Buffer.from(ed.state.lineage, 'hex')), Number(ed.state.sales || 0));
      const svg = RVM.render(progBytes, hi.lanes, hi.serial32, hi.pat, hi.wear);
      const gotRh = hashHex(enc.encode(svg));
      add('ed#' + ed.index + '_render_hash', gotRh === ed.render_hash, gotRh.slice(0, 16) + '… (' + svg.length + ' B)');
    } catch (e) {
      add('ed#' + ed.index + '_render_hash', false, e.code || e.message);
    }
  }

  return { ok: checks.every((c) => c.ok), checks };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--verify') {
    const files = args.slice(1).length ? args.slice(1) : [path.join(ROOT, 'data', 'provenance-demo.json')];
    let bad = 0;
    for (const f of files) {
      const b = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
      const res = verifyBundle(b);
      console.log((res.ok ? 'PASS ' : 'FAIL ') + path.relative(ROOT, path.resolve(f)) + ' (' + res.checks.filter((c) => c.ok).length + '/' + res.checks.length + ' checks)');
      for (const c of res.checks) console.log('  ' + (c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' | ' + c.detail : ''));
      if (!res.ok) bad = 1;
    }
    process.exit(bad);
  } else {
    const b = buildDemoBundle();
    const out = path.join(ROOT, 'data', 'provenance-demo.json');
    fs.writeFileSync(out, JSON.stringify(b, null, 2) + '\n');
    const v = verifyBundle(b);
    if (!v.ok) { console.error('FAIL verifying provenance-demo.json'); process.exit(1); }
    console.log('wrote data/provenance-demo.json (' + v.checks.length + ' checks verified offline)');
  }
}

module.exports = { buildDemoBundle, verifyBundle };
