const fs = require('fs');
let s = fs.readFileSync('secondary-v10.js', 'utf8');

// 1. Fix buy spk definition (pay artist/platform to artist, not buyer)
s = s.replace(
  "const spk = '20' + V.USER + 'ac';", 
  "const ownerSpk = '20' + ed.owner + 'ac';\n    const artistSpk = '20' + LD.series.artist + 'ac';"
);

// 2. Fix buy outputs
s = s.replace("{ amount: price - roy - fee, scriptPublicKey: spk },", "{ amount: price - roy - fee, scriptPublicKey: ownerSpk },");
s = s.replace("{ amount: roy, scriptPublicKey: spk },", "{ amount: roy, scriptPublicKey: artistSpk },");
s = s.replace("{ amount: fee, scriptPublicKey: spk },", "{ amount: fee, scriptPublicKey: artistSpk },");

// 3. Fix buy sigscript arg order (v5 ABI: buyer, ownerOutIdx, artistOutIdx, platformOutIdx)
// Removes the erroneous pushMin(B.from([0])) and uses pushMinInt for indices
s = s.replace(
  "pushMin(H(V.USER)), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('buy'))",
  "pushMin(H(V.USER)), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('buy'))"
);

// 4. Fix sell sigscript arg order (v5 ABI: buyer, salePrice, ownerOutIdx, artistOutIdx, platformOutIdx, ownerSig)
s = s.replace(
  "pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMin(H(buyer)), pushMin(B.from([0])), pushMinInt(askPrice), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('sell'))",
  "pushMin(H(buyer)), pushMinInt(askPrice), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMin(TAG('sell'))"
);

// 5. Fix sell roy math precision (if the weird *1000n drift exists)
s = s.replace(
  "const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000000n * 1000n; // bips: *500/10000",
  "const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000n;"
);

fs.writeFileSync('secondary-v10.js', s);
console.log('✅ Patched secondary-v10.js buy/sell branches robustly.');
