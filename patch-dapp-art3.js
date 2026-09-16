const fs = require('fs');
let s = fs.readFileSync('web/index.html', 'utf8');
const oldBlock = `      const ins = tx.inputs || (tx.transaction && tx.transaction.inputs) || [];
      const i0 = ins[0] || {};
      const ss = i0.signature_script || i0.signatureScript || i0.sigscript || i0.script_hex || i0.signature_script_hex || i0.script || '';
      if (!ss) { log('tx input keys: ' + Object.keys(i0).join(',')); throw new Error('no sigscript field in kascov tx json'); }
      const art = parsePushes(HX(ss)).find(p => p.length === 2048);`;
const newBlock = `      const raw = JSON.stringify(tx);
      const m = raw.match(/4d0008([0-9a-f]{4096})/i);
      if (!m) throw new Error('no 2048-byte push (4d0008…) in kascov tx json');
      const art = HX(m[1]);`;
if (!s.includes(oldBlock)) { console.error('block not found'); process.exit(1); }
s = s.split(oldBlock).join(newBlock);
fs.writeFileSync('web/index.html', s);
console.log('✅ artFor now extracts the art push schema-independently');
