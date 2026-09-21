const fs = require('fs');
for (const p of ['deploy-v11.js', 'mint-v11.js']) {
  let s = fs.readFileSync(p, 'utf8');
  s = s.split("const need = ['feeLoop','waitForConfirmation','pickUtxo','sighash','hex','pushMin','pushMinInt','covIdGenesis'];")
       .join("const need = ['feeLoop','waitForConfirmation','pickUtxo','sighash','hex','pushMin','pushMinInt'];");
  s = s.split("const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt, covIdGenesis } = OL;")
       .join("const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;\nconst covIdGenesis = V.covIdGenesis || OL.covIdGenesis;\nif (typeof covIdGenesis !== 'function') { console.error('covIdGenesis not found in v8-lib or offer-lib'); process.exit(1); }");
  fs.writeFileSync(p, s);
}
console.log('deploy-v11/mint-v11 now source covIdGenesis from v8-lib (v7-lib definition)');
