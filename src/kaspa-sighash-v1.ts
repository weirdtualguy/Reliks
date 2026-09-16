import { blake2b } from '@noble/hashes/blake2b';

const SIGHASH_KEY = Buffer.from('TransactionSigningHash', 'utf8');
const ZERO32 = Buffer.alloc(32, 0);

function H(d: Buffer) {
    return Buffer.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
}
const u8 = (v: number) => Buffer.from([v & 0xff]);
const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v: bigint | number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const varB = (b: Buffer) => Buffer.concat([u64(b.length), b]);
const hx = (h: string) => Buffer.from(h || '', 'hex');

export interface UtxoInput { txId: string; index: number; sequence: number; spk: string; amount: bigint; }
export interface TxCovenant { authorizingInput: number; covenantId: string; }
export interface TxOutput { amount: bigint; scriptPublicKey: string; covenant?: TxCovenant; }

const TX_VERSION = 1;

const previous_outputs_hash = (inputs: UtxoInput[]) =>
    H(Buffer.concat(inputs.map(i => Buffer.concat([hx(i.txId), u32(i.index)]))));

const sequences_hash = (inputs: UtxoInput[]) =>
    H(Buffer.concat(inputs.map(i => u64(i.sequence || 0))));

// sig_op_counts_hash intentionally removed: rusty-kaspa sighash.rs only includes it
// when tx.version < 1 (see calc_schnorr_signature_hash). TX_VERSION here is 1, so
// this field is never part of the v1 preimage.

const outputs_hash_v1 = (outputs: TxOutput[]) =>
    H(Buffer.concat(outputs.map(o => {
        const parts = [u64(o.amount), u16(0), varB(hx(o.scriptPublicKey))];
        if (o.covenant) {
            parts.push(u8(1), u16(o.covenant.authorizingInput), hx(o.covenant.covenantId));
        } else {
            parts.push(u8(0));
        }
        return Buffer.concat(parts);
    })));

export function kaspa_sighash_v1(inputs: UtxoInput[], outputs: TxOutput[], inputIndex: number, gas: bigint = 0n): Buffer {
    const inp = inputs[inputIndex];
    const P: Buffer[] = [];
    P.push(u16(TX_VERSION));
    P.push(previous_outputs_hash(inputs));
    P.push(sequences_hash(inputs));
    // sig_op_counts_hash: v1-only tx, field skipped (see note above)
    P.push(hx(inp.txId));
    P.push(u32(inp.index));
    P.push(u16(0));
    P.push(varB(hx(inp.spk)));
    P.push(u64(inp.amount));
    P.push(u64(inp.sequence));
    // per-input sig-op-count byte: v1-only tx, field skipped (same version gate)
    P.push(outputs_hash_v1(outputs));
    P.push(u64(0));                    // lockTime
    P.push(hx('00'.repeat(20)));       // subnetworkId (native)
    P.push(u64(gas));                  // tx.gas — subnetwork gas limit, 0 for native subnetwork
    P.push(ZERO32);                    // payload_hash — ZERO_HASH for native tx with empty payload
    P.push(u8(1));                     // hash_type (SIG_HASH_ALL)

    return H(Buffer.concat(P));
}

export function buildMintTransaction(
    input: UtxoInput,
    nftOutput: TxOutput,
    changeOutput: TxOutput,
    signatureScript: string
) {
    return {
        transaction: {
            version: TX_VERSION,
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: "0",
            inputs: [{
                previousOutpoint: { transactionId: input.txId, index: input.index },
                signatureScript,
                sequence: input.sequence,
                sigOpCount: 0,
                computeBudget: 10, // per-input, NOT sighash-covered; covers used=100000 script units: ceil((100000-9999)/10000) = 10
            }],
            outputs: [nftOutput, changeOutput].map(o => ({
                amount: o.amount.toString(),
                scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey },
            })),
        },
        allowOrphan: false,
    };
}

if (require.main === module) {
    const dummyInputs: UtxoInput[] = [{
        txId: '00'.repeat(32),
        index: 0,
        sequence: 0,
        spk: '2033fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68ac',
        amount: 100000000000n,
    }];
    const dummyOutputs: TxOutput[] = [{
        amount: 99999500000n,
        scriptPublicKey: 'aa20' + '11'.repeat(32) + '87',
    }];
    const hash = kaspa_sighash_v1(dummyInputs, dummyOutputs, 0);
    console.log('Sighash:', hash.toString('hex'), `(${hash.length} bytes)`);
    if (hash.length !== 32) throw new Error(`Expected 32-byte hash, got ${hash.length}`);
    console.log('OK: structurally valid.');
}
