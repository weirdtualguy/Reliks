const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;
const hex = b => B.from(b).toString('hex');
const H = s => B.from(s, 'hex');
const le16 = n => { const b = B.alloc(2); b.writeUInt16LE(n); return b; };
const le32 = n => { const b = B.alloc(4); b.writeUInt32LE(n); return b; };
const le64 = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const sm8  = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const pushExplicit = p => {
  const n = p.length;
  if (n === 0) return B.from([0x00]);
  if (n <= 75) return B.concat([B.from([n]), p]);
  if (n <= 255) return B.concat([B.from([0x4c, n]), p]);
  if (n <= 65535) return B.concat([B.from([0x4d]), le16(n), p]);
  return B.concat([B.from([0x4e]), le32(n), p]);
};
const payload = (ty, v) => {
  if (ty.kind === 'int' || ty.kind === 'temporal') return sm8(v);
  if (ty.kind === 'byte') return B.from([v]);
  if (ty.kind === 'bool') return B.from([v ? 1 : 0]);
  if (ty.kind === 'fixed_bytes') return H(v);
  throw new Error('unsupported ' + ty.kind);
};
const encodeState = (abi, cn, vals) =>
  B.concat(abi.contracts[cn].runtime_state.fields.map(f => pushExplicit(payload(f.type, vals[f.name]))));
const parts = (abi, cn) => {
  const c = abi.contracts[cn];
  const bc = B.from(c.compiled.bytecode);
  const { offset, len } = c.compiled.state_span;
  return { prefix: bc.subarray(0, offset), suffix: bc.subarray(offset + len), bc };
};
const p2sh = R => B.concat([B.from([0xaa, 0x20]), blake2b(R, { dkLen: 32 }), B.from([0x87])]);

const fAbi = JSON.parse(fs.readFileSync('factory-abi.json', 'utf8'));
const eAbi = JSON.parse(fs.readFileSync('edition-abi.json', 'utf8'));
const fN = Object.keys(fAbi.contracts)[0], eN = Object.keys(eAbi.contracts)[0];
const ARTIST = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const FACT_COV = 'e37e5868903c20bf67843bc7b1586f4c5bbca301a698c4e73ce51b60bca1854a';
const FACT_OUT = { tx: '588c629e9a0e530d71d2da7d506fbbb91ae907af18ca56ba8ae3c03b0e31b217', idx: 0 };
const WALLET_OUT = { tx: '6a7b7bcd203d7928956e90d06057f00a4b81d84260dbedb2daa194d02ce220fa', idx: 2 };
const ART = '00'.repeat(2048);
const programHash = hex(blake2b(H(ART), { dkLen: 32 }));
const fp = parts(fAbi, fN), ep = parts(eAbi, eN);

// Output 0: factory continuation (counter 0 -> 1)
const Rnext = B.concat([fp.prefix, encodeState(fAbi, fN,
  { art: ART, artist: ARTIST, price: 100000000, royalty_bips: 500, cap: 64, counter: 1 }), fp.suffix]);
const spkF = p2sh(Rnext);

// Output 1: edition #0
const Red = B.concat([ep.prefix, encodeState(eAbi, eN,
  { ownerIdentifier: ARTIST, identifierType: 0, price: 0, artist: ARTIST,
    royalty_bips: 500, program_hash: programHash, factory_covid: FACT_COV, serial: 0 }), ep.suffix]);
const spkE = p2sh(Red);

// KIP-20 genesis covenant id for the edition lineage (authorized by WALLET input)
const personal = B.concat([B.from('CovenantID'), B.alloc(6)]);
const edCov = hex(blake2b(B.concat([
  H(WALLET_OUT.tx), le32(WALLET_OUT.idx),
  le64(1), le32(1), le64(10000000), le16(0), le64(spkE.length), spkE
]), { dkLen: 32, personalization: personal }));

// Factory input sigscript: buyer, paymentOutIdx=2 (OP_2), editionOutIdx=1 (OP_1), tag, redeem
const tag = H(fAbi.contracts[fN].entries.mint.dispatch_tag);
const sig = B.concat([B.from([0x20]), H(ARTIST), B.from([0x52]), B.from([0x51]),
                      B.from([0x04]), tag, pushExplicit(fp.bc)]);

const tx = {
  version: 1,
  inputs: [
    {
      previousOutpoint: { transactionId: FACT_OUT.tx, index: FACT_OUT.idx },
      signatureScript: hex(sig),
      sequence: 0, sigOpCount: 0, computeBudget: 100
    },
    {
      previousOutpoint: { transactionId: WALLET_OUT.tx, index: WALLET_OUT.idx },
      signatureScript: "", // The playground will sign this input
      sequence: 0, sigOpCount: 0, computeBudget: 10
    }
  ],
  outputs: [
    {
      amount: 500000000,
      scriptPublicKey: { version: 0, scriptPublicKey: hex(spkF) },
      covenant: { authorizingInput: 0, covenantId: FACT_COV }
    },
    {
      amount: 10000000,
      scriptPublicKey: { version: 0, scriptPublicKey: hex(spkE) },
      covenant: { authorizingInput: 1, covenantId: edCov }
    },
    {
      amount: 100000000,
      scriptPublicKey: { version: 0, scriptPublicKey: hex(B.concat([B.from([0x20]), H(ARTIST), B.from([0xac])])) }
    }
  ],
  lockTime: 0, subnetworkId: '00'.repeat(20), payload: "", gas: 0
};

fs.writeFileSync('mint-playground.json', JSON.stringify(tx, null, 2));
console.log('✅ Generated mint-playground.json');
console.log('Edition Covenant ID:', edCov);
console.log('\nPaste this file into the kascov playground "Sign & Broadcast" tab.');
