import { compileNftInstance } from './compiler-bridge';
import { blake2b } from '@noble/hashes/blake2b';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';
const palette = encodePalette(Array.from({ length: 16 }, (_, i) => (i === 1 ? { r: 220, g: 40, b: 40 } : { r: 0, g: 0, b: 0 })));
const bg   = encodeTraitLayer(LayerType.Background, 0, new Array(256).fill(1)).substring(4);
const skin = encodeTraitLayer(LayerType.BodySkin,   1, new Array(256).fill(0)).substring(4);
const eyes = encodeTraitLayer(LayerType.Eyes,       2, new Array(256).fill(0)).substring(4);
const hair = encodeTraitLayer(LayerType.Hair,       3, new Array(256).fill(0)).substring(4);
const COLLECTION_ID = Buffer.from(blake2b(Buffer.from('pixel-cove-genesis-collection', 'utf8'), { dkLen: 32 })).toString('hex');
const { bytecodeHex } = compileNftInstance({
    collectionId: '0x' + COLLECTION_ID,
    tokenId: 1,
    artPayload: '0x' + palette + bg + skin + eyes + hair,
    initOwner: '0x33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68',
    initScheme: 0,
});
console.log(bytecodeHex);
