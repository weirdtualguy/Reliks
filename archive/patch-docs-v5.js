const fs = require('fs');

// 1. Patch HANDOFF.md
const hPath = 'HANDOFF.md';
let hContent = fs.readFileSync(hPath, 'utf8');
const hAnchor = 'Versioning rule reaffirmed: logic change ⇒ new major version + fresh genesis; old instances remain as on-chain proof artifacts (v1, v2 closed-by-design, v3-cap2 closed, v3 live, v4 proof-closed).';
const hAddition = `\n\nSeriesFactory v5 — multi-chunk generative art architecture (2026-09-17)\nBreaks the 2048-byte on-chain art limit by splitting the art program into 2KB P2SH data cells (ArtChunks).\nArchitecture: Genesis tx creates 1 P2SH factory + N P2SH ArtChunks. Reveal tx spends ArtChunks to expose raw data in sigscripts and reclaim mass. Mint tx only spends the lightweight factory (art payload removed from state, replaced by 32-byte blake2b program_hash).\nv5 factory covenant: f4e14debfdbfdc4fe3c18627acbdb156f4f7e0eea020fb041ba217992167c733\ngenesis/deploy 80aa4c3e9e276d53c11828410709a6bf3c24d34c9fe8f46bcf7da9c39808ebeb\nmint #0 0392720cc80dd4dc70801a3d8e2c9eb79b984a9cf38ed905c5e1311adc3d983b (edition 883a96c9...)\nreveal 80bb6efb5763713ba75ceb26e4e09b4af9db616a04378d7b344fb97e5aed6eb0 (art data permanently on-chain, mass reclaimed).\nPROOFS: lightweight mint passes (factory state reduced from 6419 to 4398 bytes), reveal exposes 2x 2048B chunks in sigscripts.`;

if (hContent.includes(hAnchor) && !hContent.includes('SeriesFactory v5 — multi-chunk')) {
    hContent = hContent.replace(hAnchor, hAnchor + hAddition);
    fs.writeFileSync(hPath, hContent);
    console.log('✅ Patched HANDOFF.md with v5 proofs');
} else {
    console.log('⚠️ HANDOFF.md anchor not found or already patched');
}

// 2. Patch SESSION-SNAPSHOT.md
const sPath = 'SESSION-SNAPSHOT.md';
let sContent = fs.readFileSync(sPath, 'utf8');
const sAnchor = 'Pending (supersedes earlier list):';
const sAddition = `v5 MULTI-CHUNK ERA — breaking the 2048-byte limit (2026-09-17)\nExternalizing the 2KB art payload from the factory state into dedicated P2SH data cells (ArtChunks).\nFactory state drops 'art' field, adds 'program_hash' (blake2b of concatenated chunks) and bakes Edition template prefix/suffix into bytecode constants.\nGenesis tx: 1 P2SH factory + N P2SH ArtChunks.\nReveal tx: Spends ArtChunks to expose raw 2KB slices in sigscripts (permanently on-chain) and reclaims storage mass.\nMint tx: Spends lightweight factory (4398 bytes vs v4's 6419 bytes), proving ultra-low minting fees.\nv5 factory covenant: f4e14debfdbfdc4fe3c18627acbdb156f4f7e0eea020fb041ba217992167c733\ngenesis 80aa4c3e | mint 0392720c | reveal 80bb6efb.\nClient retrieval: Edition -> factory_covid -> kascov lineage -> genesis txid -> fetch reveal tx -> extract chunks from sigscripts -> blake2b verify -> execute canvas.\n\n`;

if (sContent.includes(sAnchor) && !sContent.includes('v5 MULTI-CHUNK ERA')) {
    sContent = sContent.replace(sAnchor, sAddition + sAnchor);
    fs.writeFileSync(sPath, sContent);
    console.log('✅ Patched SESSION-SNAPSHOT.md with v5 era');
} else {
    console.log('⚠️ SESSION-SNAPSHOT.md anchor not found or already patched');
}
