import * as fs from 'fs';
const { RpcClient } = require('@dfns/kaspa-wasm');
(async () => {
    const tx = JSON.parse(fs.readFileSync('sell-tx.json', 'utf8')).transaction;
    for (const url of [
        'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json',
        'wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json',
    ]) {
        try {
            const rpc = new RpcClient({ url, networkId: 'testnet-10', encoding: 'json' });
            await rpc.connect();
            const res: any = await rpc.submitTransaction({ transaction: tx });
            console.log('🎉 SUBMITTED:', JSON.stringify(res));
            process.exit(0);
        } catch (e: any) { console.log('❌', url, '->', e?.message || e); }
    }
    process.exit(1);
})();
