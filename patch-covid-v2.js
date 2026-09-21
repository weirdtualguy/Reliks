const fs = require('fs');
const DEF = "const covIdGenesis = require('./v7-lib.js').covIdGenesis || V.covIdGenesis || OL.covIdGenesis;\nif (typeof covIdGenesis !== 'function') { console.error('covIdGenesis unavailable in v7/v8/offer libs'); process.exit(1); }";
const OLD_DEF = "const covIdGenesis = V.covIdGenesis || OL.covIdGenesis;\nif (typeof covIdGenesis !== 'function') { console.error('covIdGenesis not found in v8-lib or offer-lib'); process.exit(1); }";
for (const p of ['deploy-v11.js', 'mint-v11.js']) {
  let s = fs.readFileSync(p, 'utf8');
  s = s.split(', covIdGenesis } = OL;').join(' } = OL;');          // drop from OL destructuring (any file still having it)
  s = s.split(OLD_DEF).join(DEF);                                  // upgrade earlier partial patch
  if (!s.includes('const covIdGenesis =')) {
    s = s.split('} = OL;').join('} = OL;\n' + DEF);                // insert fresh definition right after OL destructuring
  }
  fs.writeFileSync(p, s);
  console.log(p, '-> covIdGenesis sourced v7-lib-first with guard');
}
