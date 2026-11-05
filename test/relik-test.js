// Relik file generator: embedded data is self-consistent, the page is self-contained, mismatches are refused at build time.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + ' | ' + e.message); } };
const A = require('../web/rvm-asm.js'), R = require('../v13/vm/rvm.js'), b2 = u => require('../web/blake2b.js').blake2b(u, 32);
const { buildRelik } = require('../tools/make-relik.js');
const hx = u => Buffer.from(u).toString('hex');
const prog = A.assemble(fs.readFileSync(path.join(root, 'web', 'vm-templates', 'iso.txt'), 'utf8'));
const series = { programHash: hx(b2(prog)), artist: 'ab'.repeat(32), royaltyBips: 500, engineLang: 2 };
const edition = { serial: '2884738305227171331', lineage: hx(b2(Uint8Array.of(7))), sales: 41, owner: 'cd'.repeat(32), price: 100000000, cov: 'ef'.repeat(32), txId: '12'.repeat(32), index: 0, spk: 'aa20' + '34'.repeat(32) + '87' };
const lane = { covenantId: '56'.repeat(32), genesisTxId: '78'.repeat(32) };
const build = (ed, sr) => buildRelik({ prog, series: sr || series, edition: ed || edition, lane, network: 'testnet-10', asOf: '2026-11-05T00:00:00.000Z' });
const html = build();
t('page is self-contained (no network, no external assets, no eval/innerHTML)', () => {
  if (/<script[^>]+\ssrc=/i.test(html) || /<link[^>]+rel=["']?stylesheet/i.test(html)) throw new Error('external asset');
  const urls = (html.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter(u => !/^http:\/\/www\.w3\.org\//.test(u));
  if (urls.length) throw new Error(urls.join(', '));
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(|innerHTML|new\s+Function/.test(html)) throw new Error('forbidden construct');
});
t('embedded data equals an independent render at the claimed state', () => {
  const m = /window\.RELIK=(.*?);<\/script>/s.exec(html); if (!m) throw new Error('no data block');
  const D = JSON.parse(m[1]);
  if (D.prog !== hx(prog) || D.series.programHash !== series.programHash) throw new Error('program mismatch');
  const hi = R.hostInputs(b2, edition.serial, new Uint8Array(Buffer.from(edition.lineage, 'hex')), edition.sales);
  const svg = R.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear);
  if (hx(b2(new Uint8Array(Buffer.from(svg, 'ascii')))) !== D.renderHash) throw new Error('renderHash differs');
  if (D.edition.serial !== edition.serial || D.edition.sales !== 41) throw new Error('state not embedded');
});
t('refuses a program that does not hash to the series program_hash', () => { let th = false; try { build(null, { ...series, programHash: '00'.repeat(32) }); } catch (e) { th = true; } if (!th) throw new Error('built anyway'); });
t('refuses malformed state', () => {
  for (const bad of [{ ...edition, serial: '12x' }, { ...edition, lineage: 'zz' }, { ...edition, sales: -1 }, { ...edition, sales: 1.5 }]) { let th = false; try { build(bad); } catch (e) { th = true; } if (!th) throw new Error('built with ' + JSON.stringify(bad).slice(0, 60)); }
});
t('wear 255 and sales above 255 build', () => { build({ ...edition, sales: 255 }); build({ ...edition, sales: 1000 }); });
console.log('relik-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
