#!/usr/bin/env node
/* gen-provenance-bundle.js - Builds and verifies self-contained offline provenance bundles.
   A provenance bundle packages:
     - Series metadata & anchors (laneCovenantId, genesisTxId, artist, price, royalty_bips, engine_lang, program_hash, render_hash)
     - Full engine bytes (engine_src for v12 JS or program_hex for v13 Reliks-VM)
     - Contract template ABIs (factory & edition prefixHex, suffixHex, span, templateHashHex)
     - Complete per-edition state & render vectors (serial, serial32, lanes, lineage, sales, pat, wear, expectedSpk, render_hash)

   Anyone with a bundle + any conforming interpreter can reproduce and verify the entire series forever,
   100% offline, with zero indexer or network dependencies.

   Usage:
     node tools/gen-provenance-bundle.js                     # generate data/provenance-v12-genesis.json and v13/provenance-v13-demo.json
     node tools/gen-provenance-bundle.js --verify [file...]  # verify bundle(s) completely offline
*/
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { blake2b } = require(path.join(ROOT, 'web', 'blake2b.js'));
const ReliksChain = require(path.join(ROOT, 'web', 'reliks-chain.js'));
const RVM = require(path.join(ROOT, 'v13', 'vm', 'rvm.js'));
const makeTemplates = require(path.join(ROOT, 'lib', 'reliks-templates.js'));

const enc = new TextEncoder();
const hx = (u) => Buffer.from(u).toString('hex');
const hashHex = (u) => hx(blake2b(u instanceof Uint8Array ? u : new Uint8Array(u), 32));

function jsSeedLanes(seedNum) {
  const le = new Uint8Array(8);
  new DataView(le.buffer).setBigUint64(0, BigInt(seedNum), true);
  const msg = new Uint8Array(13 + 8);
  msg.set(enc.encode('ReliksSeedV10'), 0);
  msg.set(le, 13);
  const h = blake2b(msg, 32);
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  const out = [];
  for (let i = 0; i < 8; i++) out.push(dv.getInt32(i * 4, true));
  return out;
}

function buildV12MainnetBundle() {
  const anchors = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mainnet-anchors.json'), 'utf8'));
  const s = anchors.series[0];
  const E = require(path.join(ROOT, 'lib', s.engine));
  const tpl = makeTemplates({ editionAbi: 'edition-abi-v12.json' });
  const C = ReliksChain.init(tpl);

  const editions = s.editions.map((ed, i) => {
    const consumedTxId = i === 0 ? s.genesisTxId : s.editions[i - 1].mintTxId;
    const serial = C.serialFromOutpoint(consumedTxId, 0);
    if (serial !== String(ed.serial)) throw new Error('v12 bundle: serial mismatch at edition ' + i);
    const seed32 = Number(BigInt(serial) & 0xFFFFFFFFn);
    const lanes = jsSeedLanes(seed32);
    const svg = E.render(serial);
    const rHash = hashHex(enc.encode(svg));
    const state = {
      ownerIdentifier: ed.ownerAtMint,
      identifierType: 0,
      price: '0',
      artist: s.artist,
      royalty_bips: '500',
      program_hash: s.programHash,
      factory_covid: s.laneCovenantId,
      serial: String(ed.serial)
    };
    const expectedSpk = C.p2shSpk(C.editionRedeem(state));
    return {
      index: ed.index,
      serial: String(ed.serial),
      serial32: seed32 | 0,
      lanes,
      covenantId: ed.covenantId,
      mintTxId: ed.mintTxId,
      outputIndex: ed.outputIndex,
      consumedLaneOutpoint: consumedTxId + ':0',
      ownerAtMint: ed.ownerAtMint,
      state,
      expectedSpk,
      render_hash: rHash,
      svg_bytes: Buffer.byteLength(svg, 'utf8')
    };
  });

  return {
    reliks_provenance_bundle: 1,
    generated_at: '2026-11-13',
    network: anchors.network,
    hrp: anchors.hrp,
    series: {
      id: s.id,
      title: s.title,
      protocol_version: 'v12',
      laneCovenantId: s.laneCovenantId,
      genesisTxId: s.genesisTxId,
      artist: s.artist,
      price: '100000000',
      royalty_bips: '500',
      mints_left_at_genesis: 1,
      engine_lang: 1,
      engine_kind: 'js',
      program_hash: s.programHash,
      render_hash: s.renderHash,
      engine_src: E.ENGINE_SRC
    },
    templates: tpl,
    editions
  };
}

function buildV13DemoBundle() {
  const tpl13 = makeTemplates({ editionAbi: 'edition-abi-v13.json' });
  const C = ReliksChain.init(tpl13);
  const asm = require(path.join(ROOT, 'web', 'rvm-asm.js'));
  const cleanSrc = fs.readFileSync(path.join(ROOT, 'v13', 'vm', 'asm-corpus', 'dagcity_clean.txt'), 'utf8');
  const prog = asm.assemble(cleanSrc);
  const progHex = hx(prog);
  const progHash = hashHex(prog);
  const hiAnchor = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
  const svgAnchor = RVM.render(prog, hiAnchor.lanes, hiAnchor.serial32, hiAnchor.pat, hiAnchor.wear);
  const renderHash = hashHex(enc.encode(svgAnchor));

  // Deterministic testnet-10 VM series editions (matching v13/RELIKS-VM-SPEC.md & docs/STATE.md)
  const genesisTxId = '029c14e56034353f671ab2abdec244d53dc65bf2298304a533e1d6529badb904';
  const laneCovId = 'cf1f1e60a7381496d886aaa5dddb2317c848202bdf1abdf9fe0accb7ba826d07';
  const artist = '25aafe02662998a62b4b4c1a887005ea8c604705c0a3cb29c3f63dfb85332f8b';
  const mintTxs = [
    { mintTxId: 'c7fc689f54f404e0a770ddb4d303b861592d1d508c779c545a64407fccf72846', sales: 0 },
    { mintTxId: '86860766c7a104e0a770ddb4d303b861592d1d508c779c545a64407fccf72847', sales: 1 },
    { mintTxId: '4fef24e96034353f671ab2abdec244d53dc65bf2298304a533e1d6529badb905', sales: 3 }
  ];

  const editions = mintTxs.map((m, i) => {
    const consumedTxId = i === 0 ? genesisTxId : mintTxs[i - 1].mintTxId;
    const serial = C.serialFromOutpoint(consumedTxId, 0);
    let lineage = C.genesisLineage(consumedTxId, 0);
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
      consumedLaneOutpoint: consumedTxId + ':0',
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
    generated_at: '2026-11-13',
    network: 'testnet-10',
    hrp: 'kaspatest',
    series: {
      id: 'v13-vm-dag-city',
      title: 'Reliks v13: DAG-City (Reliks-VM)',
      protocol_version: 'v13',
      laneCovenantId: laneCovId,
      genesisTxId,
      artist,
      price: '100000000',
      royalty_bips: '500',
      mints_left_at_genesis: 8,
      engine_lang: 2,
      engine_kind: 'vm',
      program_hash: progHash,
      render_hash: renderHash,
      program_hex: progHex
    },
    templates: { edition: tpl13.edition },
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
  const isVm = s.engine_kind === 'vm' || (typeof s.program_hex === 'string' && /^52564d01/i.test(s.program_hex));
  add('bundle_format', true, s.id + ' (' + (isVm ? 'Reliks-VM' : 'JS') + ', ' + bundle.editions.length + ' edition(s))');

  let progBytes = null, jsFn = null;
  if (isVm) {
    progBytes = new Uint8Array(Buffer.from(s.program_hex, 'hex'));
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
  } else {
    const srcBytes = enc.encode(s.engine_src || '');
    const gotPh = hashHex(srcBytes);
    add('program_hash', gotPh === s.program_hash, gotPh.slice(0, 16) + '…');
    try {
      jsFn = new Function('L', 'serial', s.engine_src + '\nreturn reliks(L,serial);');
      const svg1 = jsFn(jsSeedLanes(1), 1);
      const gotRh = hashHex(enc.encode(svg1));
      add('anchor_render_hash', gotRh === s.render_hash, gotRh.slice(0, 16) + '…');
    } catch (e) {
      add('anchor_render_hash', false, e.message);
    }
    if (bundle.templates && bundle.templates.factory && bundle.templates.factory.suffixHex) {
      const baked = bundle.templates.factory.suffixHex.indexOf(hx(srcBytes)) >= 0;
      add('factory_template_baked', baked, 'engine bytes in factory suffix');
    }
  }

  const tpl = {
    factory: (bundle.templates && bundle.templates.factory) || makeTemplates().factory,
    edition: (bundle.templates && bundle.templates.edition) || makeTemplates().edition
  };
  const C = ReliksChain.init(tpl);

  for (const ed of bundle.editions) {
    const [opTx, opIdx] = String(ed.consumedLaneOutpoint || '').split(':');
    const expSerial = C.serialFromOutpoint(opTx, Number(opIdx || 0));
    add('ed#' + ed.index + '_serial', expSerial === String(ed.serial), 'serial ' + ed.serial);

    const rebSpk = C.p2shSpk(C.editionRedeem(ed.state));
    add('ed#' + ed.index + '_script_commitment', rebSpk === ed.expectedSpk, rebSpk.slice(0, 16) + '…');

    try {
      let svg;
      if (isVm) {
        const hi = RVM.hostInputs(blake2b, ed.serial, new Uint8Array(Buffer.from(ed.state.lineage, 'hex')), Number(ed.state.sales || 0));
        svg = RVM.render(progBytes, hi.lanes, hi.serial32, hi.pat, hi.wear);
      } else {
        const s32 = Number(BigInt(ed.serial) & 0xFFFFFFFFn);
        svg = jsFn(jsSeedLanes(s32), s32 | 0);
      }
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
    const files = args.slice(1).length ? args.slice(1) : [
      path.join(ROOT, 'data', 'provenance-v12-genesis.json'),
      path.join(ROOT, 'v13', 'provenance-v13-demo.json')
    ];
    let bad = 0;
    for (const f of files) {
      const b = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
      const res = verifyBundle(b);
      console.log((res.ok ? 'PASS ' : 'FAIL ') + path.relative(ROOT, path.resolve(f)) + ' (' + res.checks.filter(c => c.ok).length + '/' + res.checks.length + ' checks)');
      for (const c of res.checks) console.log('  ' + (c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' | ' + c.detail : ''));
      if (!res.ok) bad = 1;
    }
    process.exit(bad);
  } else {
    const b12 = buildV12MainnetBundle();
    const out12 = path.join(ROOT, 'data', 'provenance-v12-genesis.json');
    fs.writeFileSync(out12, JSON.stringify(b12, null, 2) + '\n');
    const v12 = verifyBundle(b12);
    if (!v12.ok) { console.error('FAIL verifying v12 bundle'); process.exit(1); }
    console.log('wrote data/provenance-v12-genesis.json (' + v12.checks.length + ' checks verified offline)');

    const b13 = buildV13DemoBundle();
    const out13 = path.join(ROOT, 'v13', 'provenance-v13-demo.json');
    fs.writeFileSync(out13, JSON.stringify(b13, null, 2) + '\n');
    const v13 = verifyBundle(b13);
    if (!v13.ok) { console.error('FAIL verifying v13 bundle'); process.exit(1); }
    console.log('wrote v13/provenance-v13-demo.json (' + v13.checks.length + ' checks verified offline)');
  }
}

module.exports = { buildV12MainnetBundle, buildV13DemoBundle, verifyBundle };
