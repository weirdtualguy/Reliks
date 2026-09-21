const fs = require('fs');

// 1. Patch verify-render-v10.js
let v = fs.readFileSync('verify-render-v10.js', 'utf8');
const oldVState = `program_hash: LD.series.program_hash,
      artist: LD.series.artist,
      price: LD.series.price,
      royalty_bips: LD.series.royalty_bips,
      mints_left: LD.series.mints_left,
      engine_lang: LD.series.engine_lang,
      render_hash: LD.series.render_hash`;
const newVState = `program_hash: LD.series.program_hash,
      artist: LD.series.artist,
      price: LD.series.price,
      royalty_bips: LD.series.royalty_bips,
      mints_left: LD.series.mints_left,
      engine_lang: LD.series.engine_lang,
      render_hash: LD.series.render_hash,
      treasury: LD.series.treasury`;

// The verifier might construct the state in a few places (genesis check, continuation check).
// Let's do a global replace for the exact 7-field block.
if (v.includes(oldVState)) {
  v = v.split(oldVState).join(newVState);
  fs.writeFileSync('verify-render-v10.js', v);
  console.log('verify-render-v10.js: added treasury to factory state reconstruction');
} else {
  // Fallback: if the formatting is slightly different, search for the render_hash line and append treasury
  v = v.replace(/render_hash: LD\.series\.render_hash(?!\s*,\s*treasury)/g, 'render_hash: LD.series.render_hash,\n      treasury: LD.series.treasury');
  fs.writeFileSync('verify-render-v10.js', v);
  console.log('verify-render-v10.js: added treasury via regex fallback');
}

// 2. Patch gen-gallery-v10.js
let g = fs.readFileSync('gen-gallery-v10.js', 'utf8');
if (g.includes(oldVState)) {
  g = g.split(oldVState).join(newVState);
  fs.writeFileSync('gen-gallery-v10.js', g);
  console.log('gen-gallery-v10.js: added treasury to factory state reconstruction');
} else {
  g = g.replace(/render_hash: LD\.series\.render_hash(?!\s*,\s*treasury)/g, 'render_hash: LD.series.render_hash,\n      treasury: LD.series.treasury');
  fs.writeFileSync('gen-gallery-v10.js', g);
  console.log('gen-gallery-v10.js: added treasury via regex fallback');
}
