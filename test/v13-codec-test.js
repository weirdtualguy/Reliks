// Network-free tests for the v13 edition state codec (10 fields, span 203). Default v12 behaviour is covered by chain-test.js.
'use strict';
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'web', 'reliks-chain.js'));
const tplFn = require(path.join(root, 'reliks-templates.js'));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' | ' + e.message); } };
const eq = (a, b, m) => { if (String(a) !== String(b)) throw new Error((m || 'mismatch') + ': ' + a + ' != ' + b); };
const abi = JSON.parse(fs.readFileSync(path.join(root, 'data', 'edition-abi-v13.json'), 'utf8'));
const ed = abi.contracts[Object.keys(abi.contracts)[0]];
const H = s => Buffer.from(s, 'hex');
// independent reference encoder driven only by the compiled ABI (pushes: 1-byte length prefix for <=75 bytes)
const ref = (vals) => Buffer.concat(ed.runtime_state.fields.map(f => {
  const k = f.type.kind, x = vals[f.name]; let b;
  if (k === 'int') { b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(x)); }
  else if (k === 'byte') b = Buffer.from([Number(x) & 255]);
  else b = H(x);
  return Buffer.concat([Buffer.from([b.length]), b]);
}));
const R = n => Buffer.from(Array.from({ length: 32 }, (_, i) => (n * 7 + i * 13) & 255)).toString('hex');
const st = (n) => ({ ownerIdentifier: R(n), identifierType: 0, price: 100000000 * n, artist: R(n + 1), royalty_bips: 500, program_hash: R(n + 2), factory_covid: R(n + 3), serial: '5101686694205900145', lineage: R(n + 4), sales: n });

(async () => {
  await t('default templates stay v12 (161-byte edition span)', () => { const x = tplFn(); eq(x.edition.span.len, 161); eq(x.edition.fields.length, 8); });
  await t('v13 ABI: 10 fields, span 203, ends with lineage, sales', () => {
    const f = ed.runtime_state.fields.map(x => x.name);
    eq(f.length, 10); eq(f[8], 'lineage'); eq(f[9], 'sales'); eq(ed.compiled.state_span.len, 203);
  });
  C.init(tplFn({ editionAbi: 'edition-abi-v13.json' }));
  await t('web encEditionState equals the ABI-driven reference encoder and the compiled span', () => {
    for (let n = 1; n <= 5; n++) { const e = Buffer.from(C.encEditionState(st(n))); eq(e.toString('hex'), ref(st(n)).toString('hex'), 'state ' + n); eq(e.length, 203); }
  });
  await t('editionRedeem is exactly template-sized', () => eq(C.editionRedeem(st(3)).length, ed.compiled.bytecode.length));
  await t('encode -> decode round trip (script-embedded state)', () => {
    const span = tplFn({ editionAbi: 'edition-abi-v13.json' }).edition.span;
    const redeem = Buffer.from(C.editionRedeem(st(2))).toString('hex');
    const d = C.decodeEditionState(redeem);
    eq(d.lineage, st(2).lineage); eq(d.sales, st(2).sales); eq(d.serial, st(2).serial); eq(d.ownerIdentifier, st(2).ownerIdentifier);
  });
  await t('missing lineage or sales fails closed', () => {
    const a = st(1); delete a.lineage; let threw = false; try { C.encEditionState(a); } catch (e) { threw = /state field missing: lineage/.test(e.message); } if (!threw) throw new Error('did not throw');
    const b = st(1); delete b.sales; threw = false; try { C.encEditionState(b); } catch (e) { threw = /state field missing: sales/.test(e.message); } if (!threw) throw new Error('did not throw');
  });
  await t('lineage helpers: deterministic, 32 bytes, owner- and prev-sensitive', () => {
    const g = C.genesisLineage(R(9), 0); eq(g.length, 64); eq(g, C.genesisLineage(R(9), 0));
    if (g === C.genesisLineage(R(9), 1)) throw new Error('index ignored');
    const a = C.advanceLineage(g, R(1)), b = C.advanceLineage(g, R(2)), c2 = C.advanceLineage(a, R(1));
    eq(a.length, 64); if (a === b || a === c2 || a === g) throw new Error('collision');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
