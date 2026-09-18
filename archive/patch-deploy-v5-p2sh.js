const fs = require('fs');
const p = 'deploy-v5.js';
let s = fs.readFileSync(p, 'utf8');

const oldFn = `function buildArtChunkSpk(artistPubKey, chunkHex) {
    const chunkBytes = H(chunkHex);
    const pushData = B.concat([B.from([0x4d]), le16(chunkBytes.length), chunkBytes]);
    const opDrop = B.from([0x75]);
    const pkCheck = B.concat([B.from([0x20]), artistPubKey, B.from([0xac])]);
    return B.concat([pushData, opDrop, pkCheck]);
}`;
const newFn = `function buildArtChunkRedeem(artistPubKey, chunkHex) {
    const chunkBytes = H(chunkHex);
    const pushData = B.concat([B.from([0x4d]), le16(chunkBytes.length), chunkBytes]);
    const opDrop = B.from([0x75]);
    const pkCheck = B.concat([B.from([0x20]), artistPubKey, B.from([0xac])]);
    return B.concat([pushData, opDrop, pkCheck]);
}
function buildArtChunkSpk(artistPubKey, chunkHex) {
    const redeem = buildArtChunkRedeem(artistPubKey, chunkHex);
    return 'aa20' + hex(blake2b(redeem, { dkLen: 32 })) + '87';
}`;
if (!s.includes(oldFn)) { console.error('anchor not found: buildArtChunkSpk'); process.exit(1); }
s = s.split(oldFn).join(newFn);

if (!s.includes('hex(chunkSpk)')) { console.error('anchor not found: hex(chunkSpk)'); process.exit(1); }
s = s.split('hex(chunkSpk)').join('chunkSpk');

fs.writeFileSync(p, s);
console.log('patched deploy-v5.js: ArtChunks now P2SH-wrapped (standard)');
