const fs = require('fs');

function patchFile(p) {
  let s = fs.readFileSync(p, 'utf8');
  
  // Look for the factory state construction block.
  // It ends with render_hash: LD.series.render_hash
  // We need to append: ,\n      treasury: LD.series.treasury
  
  // Regex to match the render_hash line and ensure treasury isn't already there
  const regex = /(render_hash:\s*LD\.series\.render_hash)(?!\s*,\s*treasury)/g;
  
  if (!regex.test(s)) {
    // If the regex didn't match, it means treasury is already there, or the file structure is totally different.
    // Let's check if treasury is already there.
    if (s.includes('treasury: LD.series.treasury')) {
      console.log(p + ': treasury field already present.');
      return;
    } else {
      console.error(p + ': could not find render_hash anchor to patch.');
      process.exit(1);
    }
  }
  
  // Reset regex lastIndex
  regex.lastIndex = 0;
  
  s = s.replace(regex, '$1,\n      treasury: LD.series.treasury');
  
  fs.writeFileSync(p, s);
  console.log(p + ': added treasury to factory state reconstruction.');
}

patchFile('verify-render-v10.js');
patchFile('gen-gallery-v10.js');
