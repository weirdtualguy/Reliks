const fs = require('fs');

// 1. mint-v8: record spk + templateHash in ledger (skip if already applied)
let m = fs.readFileSync('mint-v8.js', 'utf8');
if (!m.includes('templateHash')) {
  const OLD = "(LD.editions = LD.editions || []).push(edCov);";
  const NEW = "(LD.editions = LD.editions || []).push({ cov: edCov, txId, index: 1, amount: Number(DUST), owner: V.USER, price: 0, serial, spk: hex(edSpk), templateHash: (Array.isArray(Ed.c.compiled.template_hash) ? Buffer.from(Ed.c.compiled.template_hash).toString('hex') : Ed.c.compiled.template_hash) });";
  if (!m.includes(OLD)) { console.log('❌ mint-v8 anchor missing'); process.exit(1); }
  m = m.split(OLD).join(NEW);
  fs.writeFileSync('mint-v8.js', m);
  console.log('✅ mint-v8 records spk + templateHash');
} else console.log('skip: mint-v8 already enriched');

// 2. secondary-v4: F-B17 drift guard (skip if already applied)
let s = fs.readFileSync('secondary-v4.js', 'utf8');
if (!s.includes('F-B17 template drift')) {
  const EDIN = "const edIn = { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curRedeem), amount: DUST };";
  if (!s.includes(EDIN)) { console.log('❌ secondary-v4 edIn anchor missing'); process.exit(1); }
  s = s.split(EDIN).join(EDIN + "\n  if (ed.spk && hex(edIn.spk) !== ed.spk) throw new Error('F-B17 template drift: ledger spk ' + ed.spk.slice(0, 18) + '... != recomputed ' + hex(edIn.spk).slice(0, 18) + '...');");
  console.log('✅ drift guard added');
} else console.log('skip: drift guard present');

// 3. secondary-v4: fix sig arg double-wrap in list
if (!s.includes('rawSig')) {
  const A = "const sig = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV)) + '01';";
  const B1 = "const ss = B.concat([pushMin(B.from(sig, 'hex')), pushMinInt(newPrice), pushMin(TAG('list')), pushMin(curRedeem)]);";
  const C = "return rpc(inputs, outputs, hex(ss), sig);";
  if (!s.includes(A) || !s.includes(B1) || !s.includes(C)) { console.log('❌ sig anchors missing'); process.exit(1); }
  s = s.split(A).join("const rawSig = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);");
  s = s.split(B1).join("const ss = B.concat([pushMin(B.concat([rawSig, B.from([0x01])])), pushMinInt(newPrice), pushMin(TAG('list')), pushMin(curRedeem)]);");
  s = s.split(C).join("return rpc(inputs, outputs, hex(ss), '41' + hex(rawSig) + '01');");
  console.log('✅ list sig arg now raw 65-byte payload');
} else console.log('skip: sig fix present');

fs.writeFileSync('secondary-v4.js', s);
