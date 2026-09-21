const fs = require('fs');
let v = fs.readFileSync('verify-render-v10.js', 'utf8');

// 1. Fix edition spk check -> covenant ID check
v = v.replace(
  /check\('\[#' \+ i \+ '\] edition spk == mintTx\.outputs\[1\]', edSpk === spkHex\(mintTx\.outputs\[1\]\)\);/,
  "check('[#' + i + '] edition covenant_id == mintTx.outputs[1].covenant_id', (mintTx.outputs[1].covenant_id || '') === ed.cov);"
);
console.log('edition spk check replaced with covenant_id check');

// 2. Fix F1 gate with robust prefix/suffix extraction
const f1Regex = /check\('ENGINE_SRC embedded in on-chain redeem \(engine_code == anchored engine\)',[^;]+\);/;
if (f1Regex.test(v)) {
  v = v.replace(f1Regex, `// Old F1 gate: $&
   // New robust F1 gate:
   const ss0_f1 = Buffer.from(mintTx.inputs[0].signature_script, 'hex');
   const prefIdx_f1 = ss0_f1.indexOf(F.prefix);
   const sufIdx_f1 = ss0_f1.lastIndexOf(F.suffix);
   const mintRedeem_f1 = (prefIdx_f1 >= 0 && sufIdx_f1 > prefIdx_f1) ? ss0_f1.slice(prefIdx_f1, sufIdx_f1 + F.suffix.length) : Buffer.alloc(0);
   const engineInRedeem_f1 = mintRedeem_f1.length > 0 ? mintRedeem_f1.slice(F.prefix.length, mintRedeem_f1.length - F.suffix.length).includes(Buffer.from(ENGINE.ENGINE_SRC, 'utf8')) : false;
   check('ENGINE_SRC embedded in on-chain redeem (engine_code == anchored engine)', engineInRedeem_f1);`);
  console.log('F1 gate patched with robust prefix/suffix extraction');
} else {
  console.log('F1 gate anchor not found');
}

fs.writeFileSync('verify-render-v10.js', v);
