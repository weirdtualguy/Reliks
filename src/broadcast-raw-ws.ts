import WebSocket from 'ws';
import * as fs from 'fs';

const txData = JSON.parse(fs.readFileSync('sell-tx.json', 'utf8')).transaction;

const URLS = [
    'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json',
    'wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json',
    'wss://muon-10.kaspa.blue/kaspa/testnet-10/wrpc/json'
];

let done = false;

function tryNode(i: number) {
    if (done || i >= URLS.length) {
        if (!done) console.log('❌ All raw WS nodes failed/timed out.');
        process.exit(done ? 0 : 1);
    }
    console.log(`\n🔌 Connecting to ${URLS[i]}`);
    const ws = new WebSocket(URLS[i], {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' }
    });
    const t = setTimeout(() => { console.log('⏱️ timeout'); ws.terminate(); tryNode(i + 1); }, 10000);

    ws.on('open', () => {
        console.log('✅ Connected. Sending raw wRPC JSON with id:1...');
        // This is the exact envelope the Rust node expects for wRPC JSON
        const payload = {
            id: 1,
            request: {
                submitTransactionRequest: {
                    transaction: txData,
                    allowOrphan: false
                }
            }
        };
        ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data: any) => {
        done = true; clearTimeout(t);
        const res = data.toString();
        console.log('📥 Node Response:', res);
        
        if (res.includes('transactionId')) {
            const txid = JSON.parse(res).response?.submitTransactionResponse?.transactionId;
            console.log(`\n🎉 SUCCESS! Genesis NFT sold and transitioned on-chain!`);
            console.log(`🔗 Explorer: https://kascov.io/#/testnet-10/tx/${txid}`);
        }
        ws.close();
        process.exit(0);
    });

    ws.on('error', (e: any) => { clearTimeout(t); console.log('❌ ' + e.message); tryNode(i + 1); });
    ws.on('close', (code: number) => { clearTimeout(t); if (!done && code !== 1000) tryNode(i + 1); });
}

tryNode(0);
