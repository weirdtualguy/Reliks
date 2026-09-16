import { buildSellSigScript } from './entry-sig-script';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
import * as dotenv from 'dotenv'; dotenv.config({ quiet: true });
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import * as fs from 'fs';

secp.utils.sha256Sync = (...m: Uint8Array[]) => {
    const hash = crypto.createHash('sha256');
    m.forEach(b => hash.update(b));
    return hash.digest();
};

const PRIVATE_KEY_HEX = process.env.PRIVATE_KEY_HEX || "ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3";
const USER_PUBKEY = "33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68";
const COVENANT_ID = "a0a5b2e8b4c97acb1c76656708ce5cfa2477f0354155c8b1f99fe58d67ee4809";

const NFT_UTXO_TXID = "16e5672eb4c9f491a1c77a524980b4c87a472d9b095ea245fbeb2a421695dcb8";
const P2SH_SPK = "aa20d07ee8d0bada89e92f161ac13828b6823b6eefe5f8f62ff898bd9e0b5540f35687";
const BUYER_FUNDING_TXID = "2e2547c5e5b053ebc41e044078a5bb1e5422c864021f1b7c84c34c794694dcde";
const BUYER_FUNDING_IDX = 0;
const BUYER_FUNDING_AMOUNT = 799999000000n;

const PRICE_SOMPI = 100000000n;
const MIN_FEE = 700000n; // covers kascov estimate (~662,700) with headroom
const PAYMENT_OUT_IDX = 1;
const GAS = 0n;

const txInputs: UtxoInput[] = [
    { txId: NFT_UTXO_TXID, index: 0, sequence: 0, spk: P2SH_SPK, amount: 1000000000n },
    { txId: BUYER_FUNDING_TXID, index: BUYER_FUNDING_IDX, sequence: 0, spk: `20${USER_PUBKEY}ac`, amount: BUYER_FUNDING_AMOUNT }
];

// Output 0 carries the KIP-20 continuation binding — included in the sighash
const txOutputs: TxOutput[] = [
    { amount: 1000000000n, scriptPublicKey: P2SH_SPK, covenant: { authorizingInput: 0, covenantId: COVENANT_ID } },
    { amount: PRICE_SOMPI, scriptPublicKey: `20${USER_PUBKEY}ac` },
    { amount: BUYER_FUNDING_AMOUNT - PRICE_SOMPI - MIN_FEE, scriptPublicKey: `20${USER_PUBKEY}ac` }
];

const hash0 = kaspa_sighash_v1(txInputs, txOutputs, 0, GAS);
const ownerSigHex = Buffer.from(secp.schnorr.signSync(hash0, PRIVATE_KEY_HEX)).toString('hex') + "01";
const hash1 = kaspa_sighash_v1(txInputs, txOutputs, 1, GAS);
const fundingSigScript = "41" + Buffer.from(secp.schnorr.signSync(hash1, PRIVATE_KEY_HEX)).toString('hex') + "01";

const contractBytecode = fs.readFileSync('sell-program.hex', 'utf-8').trim();
const sigScript = buildSellSigScript(ownerSigHex, USER_PUBKEY, "00", PRICE_SOMPI, PAYMENT_OUT_IDX, contractBytecode);

const tx = {
    transaction: {
        version: 1,
        inputs: [
            { previousOutpoint: { transactionId: NFT_UTXO_TXID, index: 0 }, signatureScript: sigScript, sequence: 0, sigOpCount: 0, computeBudget: 10 },
            { previousOutpoint: { transactionId: BUYER_FUNDING_TXID, index: BUYER_FUNDING_IDX }, signatureScript: fundingSigScript, sequence: 0, sigOpCount: 0, computeBudget: 10 }
        ],
        outputs: txOutputs.map(o => ({
            amount: o.amount.toString(),
            scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey },
            ...(o.covenant ? { covenant: { authorizingInput: o.covenant.authorizingInput, covenantId: o.covenant.covenantId } } : {})
        })),
        lockTime: 0,
        subnetworkId: "0000000000000000000000000000000000000000",
        gas: GAS.toString()
    },
    allowOrphan: false
};
console.log(JSON.stringify(tx, null, 2));
