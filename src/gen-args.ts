import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';
const palette = encodePalette(Array.from({ length: 16 }, (_, i) => (i === 1 ? { r: 220, g: 40, b: 40 } : { r: 0, g: 0, b: 0 })));
const bg   = encodeTraitLayer(LayerType.Background, 0, new Array(256).fill(1)).substring(4);
const skin = encodeTraitLayer(LayerType.BodySkin,   1, new Array(256).fill(0)).substring(4);
const eyes = encodeTraitLayer(LayerType.Eyes,       2, new Array(256).fill(0)).substring(4);
const hair = encodeTraitLayer(LayerType.Hair,       3, new Array(256).fill(0)).substring(4);
const B = (h: string) => Array.from(Buffer.from(h, 'hex'));
fs.writeFileSync('args.json', JSON.stringify([
  { kind: 'bytes', value: B(Buffer.from(blake2b(Buffer.from('pixel-cove-genesis-collection','utf8'), { dkLen: 32 })).toString('hex')) },
  { kind: 'int',   value: 1 },
  { kind: 'bytes', value: B(palette + bg + skin + eyes + hair) },
  { kind: 'bytes', value: B('33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68') },
  { kind: 'bytes', value: [0] },
]));
console.log('args.json written');
