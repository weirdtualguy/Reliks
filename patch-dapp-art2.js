const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const ssOld = "      const ss = (tx.inputs && tx.inputs[0] && (tx.inputs[0].signature_script || tx.inputs[0].signatureScript)) || '';";
const ssNew = `      const ins = tx.inputs || (tx.transaction && tx.transaction.inputs) || [];
      const i0 = ins[0] || {};
      const ss = i0.signature_script || i0.signatureScript || i0.sigscript || i0.script_hex || i0.signature_script_hex || i0.script || '';
      if (!ss) { log('tx input keys: ' + Object.keys(i0).join(',')); throw new Error('no sigscript field in kascov tx json'); }`;
const cacheOld = "  if (cached && hexb(blake2b(new TextEncoder().encode(cached), { dkLen: 32 })) === ph) return cached;";
const cacheNew = cacheOld + `
  const zeroHash = hexb(blake2b(new Uint8Array(2048), { dkLen: 32 }));
  if (ph === zeroHash) return '<html><body style="margin:0;background:#151515;color:#666;display:flex;align-items:center;justify-content:center;height:100vh;font-family:monospace;font-size:12px">placeholder edition · zero-art program</body></html>';`;
if (!s.includes(ssOld) || !s.includes(cacheOld)) { console.error('anchors not found'); process.exit(1); }
s = s.split(ssOld).join(ssNew);
s = s.split(cacheOld).join(cacheNew);
fs.writeFileSync('web/index.html', s);
console.log('✅ artFor hardened: sigscript field probing + zero-art label');
