const fs = require('fs');
const f2 = JSON.parse(fs.readFileSync('factory2.json', 'utf8'));
f2.counter = 1;
f2.lastMint = 'acbd1143492c37f9937aeb36403ba37f8f000809df6aa16bb89878123b21ff98';
fs.writeFileSync('factory2.json', JSON.stringify(f2, null, 1));
const f1 = { covenantId: '5bf4da9f6377eb038a9864c06816ce6a1ba9ab588432370d1d84583093c12c2a',
  genesis: 'bfc2c42eb332aaf0067424486a0515d43868664e494955964313dac75f33d056',
  counter: 1, lastMint: '5c9a118ead8549ee5d68d0dfbc22d3cc0c744ab1248b38f5eb19650587a6c25b' };
fs.writeFileSync('factory.json', JSON.stringify(f1, null, 1));
console.log('✅ factory2.json → counter 1 @ acbd1143… | factory.json (v1) restored');
