// Usage: node tools/preview-program.js <prog.hex> [editionIndex] [wear,list]. Needs no key. Writes v13/program-preview.html.
const fs = require('fs'), path = require('path');
const R = require(path.resolve('v13/vm/rvm.js')), b2 = u => require(path.resolve('web/blake2b.js')).blake2b(u, 32), hx = u => Buffer.from(u).toString('hex');
const [,, hexFile, edIdx = '1', wearList = '0,3,30,122,255'] = process.argv;
const prog = new Uint8Array(Buffer.from(fs.readFileSync(hexFile, 'utf8').trim(), 'hex'));
const h0i = R.hostInputs(b2, 1, new Uint8Array(32), 0);
const h0 = hx(b2(new Uint8Array(Buffer.from(R.render(prog, h0i.lanes, h0i.serial32, h0i.pat, h0i.wear), 'ascii'))));
console.log(h0 === '9bd989c4375220fbcb87b566c310b1ec6cb1f053ed3a701408d10bd805b9d405' ? 'REGRESSION OK: wear 0 equals the original render' : 'REGRESSION DIFF: ' + h0);
const e = require(path.resolve('v13/ledger-vm-v13.json')).editions[Number(edIdx)];
const imgs = wearList.split(',').map(Number).map(w => { const x = R.hostInputs(b2, e.serial, new Uint8Array(Buffer.from(e.lineage, 'hex')), w); const s = R.render(prog, x.lanes, x.serial32, x.pat, x.wear); return '<p>sales ' + w + '</p><img width=340 src="data:image/svg+xml;base64,' + Buffer.from(s).toString('base64') + '">'; });
fs.writeFileSync('v13/program-preview.html', '<body style=background:#06080b;color:#ccc>' + imgs.join(''));
console.log('wrote v13/program-preview.html for edition ' + edIdx);
