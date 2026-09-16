import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake2b } from '@noble/hashes/blake2b';
import { compileSeries } from './bridge3';
import { kaspa_sighash_v1 } from './kaspa-sighash-v1';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const ADDR = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const PORT = 8160;
function minify(src: string): string {
  let s = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const w = (c: string) => /[A-Za-z0-9_$]/.test(c); let out = '';
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (c === ' ') { const p = out[out.length - 1] || '', n = s[i + 1] || '';
      if (!p || !n || !w(p) || !w(n)) continue; } out += c; }
  return out.trim(); }
async function handleDeploy(js: string) {
  const min = minify(js); const jsBytes = Buffer.byteLength(min);
  if (jsBytes > 2045) throw new Error(`${jsBytes} B exceeds 2045 B budget`);
  const slot = Buffer.alloc(2048); slot[0] = 0x4a; slot.writeUInt16BE(jsBytes, 1); slot.write(min, 3, 'utf8');
  const slotHex = slot.toString('hex');
  const f = compileSeries({ slot: slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: 0, owner: USER });
  let idx = 5; while (fs.existsSync(`factory${idx}.json`)) idx++;
  const name = `factory${idx}`;
  fs.writeFileSync(`${name}-program.hex`, f.bytecodeHex);
  fs.writeFileSync(`studio-${name}.js`, js);
  fs.writeFileSync(`studio-${name}.min.js`, min);
  let d: any = null;
  for (let i = 0; i < 4 && !d; i++) { try {
    const r = await fetch('https://kascov.io/data/testnet-10/deploy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ program_hex: f.bytecodeHex, value: 1000000000 }) });
    const j = await r.json(); if (j.covenant_id) d = j; } catch { await new Promise(r => setTimeout(r, 3000)); } }
  if (!d) throw new Error('kascov deploy failed');
  let genesis = '';
  for (let i = 0; i < 15 && !genesis; i++) { try {
    const t = await (await fetch(`https://kascov.io/data/testnet-10/c/${d.covenant_id}.json`)).text();
    if (t.startsWith('{')) genesis = JSON.parse(t).events[0].txid; } catch {}
    if (!genesis) await new Promise(r => setTimeout(r, 4000)); }
  if (!genesis) throw new Error('genesis not indexed — covenant deployed but unconfirmed');
  fs.writeFileSync(`${name}.json`, JSON.stringify({ covenantId: d.covenant_id, genesis, counter: 0, slotHex }, null, 1));
  return { factory: name, covenantId: d.covenant_id, genesis, jsBytes }; }
async function handleMint(factoryName: string) {
  const F = JSON.parse(fs.readFileSync(`${factoryName}.json`, 'utf8'));
  const PROG = fs.readFileSync(`${factoryName}-program.hex`, 'utf8').trim();
  const TAG = Buffer.from(F.mintTag || '42c6a550', 'hex');
  const k = F.counter || 0;
  const V = k === 0 ? 1000000000n : 50000000n;
  const prevTx = k === 0 ? F.genesis : F.lastMint, prevIdx = k === 0 ? 0 : 1;
  const fab = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k, owner: USER });
  const child = compileSeries({ slot: F.slotHex, artist: USER, price: 0, cap: 64, role: 1, counter: k, owner: USER });
  const nextF = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k + 1, owner: USER });
  const utxos: any[] = await (await fetch(`https://api-tn10.kaspa.org/addresses/${ADDR}/utxos`)).json() as any[];
  const best = utxos.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))[0];
  if (!best) throw new Error('no wallet UTXOs');
  const w = { txId: best.outpoint.transactionId, index: best.outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(best.utxoEntry.amount) };
  const bind = { authorizingInput: 0, covenantId: F.covenantId };
  const inputs: any[] = [{ txId: prevTx, index: prevIdx, sequence: 0, spk: fab.scriptPublicKey, amount: V }, w];
  const outputs: any[] = [
    { amount: V, scriptPublicKey: child.scriptPublicKey, covenant: bind },
    { amount: 50000000n, scriptPublicKey: nextF.scriptPublicKey, covenant: bind },
    { amount: 100000000n, scriptPublicKey: `20${USER}ac` },
    { amount: w.amount - 150000000n - 2000000n, scriptPublicKey: `20${USER}ac` }];
  const wsig = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 1, 0n), PRIV)).toString('hex') + '01';
  const slot = Buffer.from(F.slotHex.replace(/^0x/, ''), 'hex'), usr = Buffer.from(USER.replace(/^0x/, ''), 'hex');
  const i8 = (v: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v), 0); return b; };
  const parts: Buffer[] = [];
  const pd = (d: Buffer) => { const l = d.length;
    if (l <= 75) parts.push(Buffer.concat([Buffer.from([l]), d]));
    else if (l <= 255) parts.push(Buffer.concat([Buffer.from([0x4c, l]), d]));
    else { const b = Buffer.alloc(2); b.writeUInt16LE(l); parts.push(Buffer.concat([Buffer.from([0x4d]), b, d])); } };
  const pi = (v: bigint) => { if (v === 0n) { parts.push(Buffer.from([0])); return; }
    if (v <= 16n) { parts.push(Buffer.from([0x50 + Number(v)])); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b;
    parts.push(Buffer.concat([Buffer.from([body.length]), body])); };
  pd(Buffer.concat([slot, slot])); pd(Buffer.concat([usr, usr]));
  pd(Buffer.concat([i8(0), i8(100000000)])); pd(Buffer.concat([i8(64), i8(64)]));
  pd(Buffer.from([1, 0])); pd(Buffer.concat([i8(k), i8(k + 1)]));
  pd(Buffer.concat([usr, usr])); pd(Buffer.from([0, 0]));
  pd(usr); pd(Buffer.from([0])); pi(2n);
  pd(TAG); pd(Buffer.from(PROG, 'hex'));
  const sigScript = Buffer.concat(parts).toString('hex');
  const tx = { version: 1, inputs: [
    { previousOutpoint: { transactionId: prevTx, index: prevIdx }, signatureScript: sigScript, sequence: 0, sigOpCount: 0, computeBudget: 60 },
    { previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: wsig, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
    outputs: outputs.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
  const body = { ...tx, gas: 0,
    inputs: tx.inputs.map((x: any, ki: number) => ({ ...x, utxo: { amount: Number(ki === 0 ? V : w.amount), scriptPublicKey: { version: 0, script: ki === 0 ? fab.scriptPublicKey : w.spk }, ...(ki === 0 ? { covenantId: F.covenantId } : {}) } })),
    outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (pf.verdict !== 'ready') throw new Error(`preflight ${pf.verdict}: ${(pf.findings || [])[0]?.message || ''}`);
  const transaction = { ...tx, gas: 0, mass: pf.masses.storage, outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const WS = require('ws'); let txid: string | null = null;
  for (const url of ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json']) {
    txid = await new Promise<string | null>(res => { const ws = new WS(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); res(null); }, 12000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction, allowOrphan: true } })));
      ws.on('message', (d: any) => { const s = d.toString(); clearTimeout(t); res(s.includes('transactionId') ? JSON.parse(s).params.transactionId : null); });
      ws.on('error', () => { clearTimeout(t); res(null); }); });
    if (txid) break; }
  if (!txid) throw new Error('broadcast failed');
  F.counter = k + 1; F.lastMint = txid;
  fs.writeFileSync(`${factoryName}.json`, JSON.stringify(F, null, 1));
  return { txid, edition: k }; }
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.hex': 'text/plain', '.pco': 'text/plain' };
function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((res, rej) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); req.on('error', rej); }); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname === '/api/deploy' && req.method === 'POST') {
    try { const b = await readBody(req); const r = await handleDeploy(b.js);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); }
    catch (e: any) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); } return; }
  if (url.pathname === '/api/mint' && req.method === 'POST') {
    try { const b = await readBody(req); const r = await handleMint(b.factory);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); }
    catch (e: any) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); } return; }
  if (url.pathname === '/api/factories') {
    const list = fs.readdirSync('.').filter(f => /^factory\d+\.json$/.test(f)).sort().map(f => {
      try { return { name: f.replace('.json', ''), ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { return null; } }).filter(Boolean);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(list)); return; }
  let fp = url.pathname === '/' ? 'studio.html' : decodeURIComponent(url.pathname.slice(1));
  if (fp.includes('..')) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res); });
server.listen(PORT, () => console.log(`🎨 pixel-cove mint studio → http://localhost:${PORT}`));
