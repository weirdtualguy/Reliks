const fs = require('fs');
const flatSecondary = `        require(tx.outputs[artistOutIdx].value == roy);
        require(tx.outputs[artistOutIdx].scriptPubKey == byte[](artistSpk));
        require(tx.outputs[platformOutIdx].value == fee);
        require(tx.outputs[platformOutIdx].scriptPubKey == byte[](artistSpk));`;
const flatPrimary = `            int fee = (price * PLATFORM_BIPS) / 10000;
            byte[36] artistSpk = new ScriptPubKeyP2PK(pubkey(artist));
            require(tx.outputs[artistOutIdx].value == price - fee);
            require(tx.outputs[artistOutIdx].scriptPubKey == byte[](artistSpk));
            require(tx.outputs[platformOutIdx].value == fee);
            require(tx.outputs[platformOutIdx].scriptPubKey == byte[](artistSpk));`;
for (const p of ['sil/ReliksEdition-v9.sil', 'sil/ReliksMinter-v9.sil']) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes('MIN_PRICE = 500000000')) { console.log(p + ': already patched'); continue; }
  s = s.replace(/int constant MIN_PRICE = 1000000;[^\n]*\n/, 'int constant MIN_PRICE = 500000000;   // 5 KAS mass-safe floor (F-B14)\n');
  s = s.replace(/int constant FEE_MERGE_THRESHOLD = 5000000000;[^\n]*\n/, '// 50 KAS merged-creator-cut variant deferred (F-B14 OPEN list); separate fee outputs proven at 5-10 KAS with 1 KAS carriers.\n');
  s = s.replace(/if \(salePrice >= FEE_MERGE_THRESHOLD\) \{[\s\S]*?\n        \} else \{\n[\s\S]*?\n        \}/, flatSecondary);
  s = s.replace(/if \(price >= FEE_MERGE_THRESHOLD\) \{[\s\S]*?\n            \} else \{\n[\s\S]*?\n            \}/, flatPrimary);
  s = s.replace('require(tx.outputs[ownerOutIdx].value == ownerNet);', 'require(tx.outputs[ownerOutIdx].value >= ownerNet);');
  fs.writeFileSync(p, s);
  console.log('patched ' + p + ': 5 KAS floor, separate fee outputs, seller >= remainder');
}
