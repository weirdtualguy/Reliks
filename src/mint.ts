import * as secp256k1 from '@noble/secp256k1';
import { blake2b } from '@noble/hashes/blake2b';
import WebSocket from 'ws';
import { compileNftInstance } from './compiler-bridge';
import { kaspa_sighash_v1, buildMintTransaction, UtxoInput, TxOutput } from './kaspa-sighash-v1';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';

const PRIVATE_KEY_HEX = "ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3";
const USER_PUBKEY = "33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68";
const FUNDING_ADDRESS = "kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd";
const P2PK_SPK = `20${USER_PUBKEY}ac`;

// Canonical Studio Genesis instance (735-byte script hash -> kaspatest:pprnxm…d42mx)
const GENESIS_SPK = 'aa2047336ebb68fa0ade391d4761a11e7a889bb72fbe79cae66059d4f0e13aec88c387';

const COLLECTION_ID = Buffer.from(blake2b(Buffer.from('pixel-cove-genesis-collection', 'utf8'), { dkLen: 32 })).toString('hex');
const TOKEN_ID = 1;
const NFT_OUTPUT_AMOUNT = 1000000000n; // 10 TKAS
const FEE = 200000n;

function buildPlaceholderArtPayload(): string {
    const palette = encodePalette(
        Array.from({ length: 16 }, (_, i) => (i === 1 ? { r: 220, g: 40, b: 40 } : { r: 0, g: 0, b: 0 }))
    );
    const bg   = encodeTraitLayer(LayerType.Background, 0, new Array(256).fill(1)).substring(4);
    const skin = encodeTraitLayer(LayerType.BodySkin,   1, new Array(256).fill(0)).substring(4);
    const eyes = encodeTraitLayer(LayerType.Eyes,       2, new Array(256).fill(0)).substring(4);
    const hair = encodeTraitLayer(LayerType.Hair,       3, new Array(256).fill(0)).substring(4);
    const payload = palette + bg + skin + eyes + hair;
    if (payload.length !== 568 * 2) throw new Error(`Art payload is ${payload.length / 2} bytes, expected 568.`);
    return payload;
}

async function fetchFundingUtxo(): Promise<UtxoInput> {
    console.log('🔍 Fetching UTXOs...');
    const res = await fetch(`https://api-tn10.kaspa.org/addresses/${FUNDING_ADDRESS}/utxos`);
    if (!res.ok) throw new Error(`UTXO fetch failed: ${res.status}`);
    const utxos: any[] = await res.json() as any[];
    if (utxos.length === 0) throw new Error('No UTXOs found at funding address.');
    const sorted = utxos.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
    const chosen = sorted[0];
    const amount = BigInt(chosen.utxoEntry.amount);
    if (amount < NFT_OUTPUT_AMOUNT + FEE) throw new Error(`Largest UTXO (${amount} sompi) insufficient.`);
    return {
        txId: chosen.outpoint.transactionId,
        index: chosen.outpoint.index,
        sequence: 0,
        spk: chosen.utxoEntry.scriptPublicKey.scriptPublicKey,
        amount,
    };
}

async function runMint() {
    const artPayload = buildPlaceholderArtPayload();
    const { scriptPublicKey: termuxSpk } = compileNftInstance({
        collectionId: `0x${COLLECTION_ID}`, tokenId: TOKEN_ID, artPayload: `0x${artPayload}`,
        initOwner: `0x${USER_PUBKEY}`, initScheme: 0,
    });
    console.log(`✅ Termux compile OK (record): ${termuxSpk}`);

    const fundingInput = await fetchFundingUtxo();
    const changeAmount = fundingInput.amount - NFT_OUTPUT_AMOUNT - FEE;
    const nftOutput: TxOutput = { amount: NFT_OUTPUT_AMOUNT, scriptPublicKey: GENESIS_SPK };
    const changeOutput: TxOutput = { amount: changeAmount, scriptPublicKey: P2PK_SPK };

    const hash = kaspa_sighash_v1([fundingInput], [nftOutput, changeOutput], 0);
    const rawSig = await secp256k1.schnorr.sign(Uint8Array.from(hash), PRIVATE_KEY_HEX);
    const signatureScript = `41${Buffer.from(rawSig).toString('hex')}01`;

    const txJson: any = buildMintTransaction(fundingInput, nftOutput, changeOutput, signatureScript);

    // Toccata TN10: v1 + committed compute budget (10 = one Schnorr op); legacy sigOpCount = 0
    txJson.transaction.version = 1;
    txJson.transaction.inputs[0].sigOpCount = 0;
    txJson.transaction.inputs[0].computeBudget = 10;

    const URLS = [
        'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json',
        'wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json',
        'wss://muon-10.kaspa.blue/kaspa/testnet-10/wrpc/json',
    ];

    let done = false;
    function tryNode(i: number): void {
        if (done) return;
        if (i >= URLS.length) { console.log('❌ all wRPC nodes failed'); process.exit(1); }
        console.log('\n📡 Connecting ' + URLS[i]);
        const ws = new WebSocket(URLS[i], {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
        });
        const t = setTimeout(() => { console.log('⏱ timeout'); ws.terminate(); tryNode(i + 1); }, 8000);
        ws.on('open', () => {
            console.log('✅ connected, sending submitTransactionRequest (clean envelope)...');
            ws.send(JSON.stringify(
                { id: 1, method: 'submitTransactionRequest',
                  params: { transaction: txJson.transaction, allowOrphan: false } },
                (k, v) => (typeof v === 'bigint' ? Number(v) : v)
            ));
        });
        ws.on('message', (d: any) => {
            done = true; clearTimeout(t);
            console.log('📥 Node Response:', d.toString());
            ws.close(); process.exit(0);
        });
        ws.on('error', (e: any) => { clearTimeout(t); console.log('❌ ' + e.message); tryNode(i + 1); });
        ws.on('close', (code: number) => { clearTimeout(t); if (!done && code !== 1000) tryNode(i + 1); });
    }
    tryNode(0);
}

runMint();
