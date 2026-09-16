async function checkWallet() {
    const address = "kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd";
    console.log(`🔍 Scanning Testnet-10 for UTXOs at: ${address}\n`);

    try {
        // Correct Testnet-10 REST API endpoint
        const response = await fetch(`https://api-tn10.kaspa.org/addresses/${address}/utxos`);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        processUtxos(await response.json());

    } catch (error) {
        console.error("❌ Failed to fetch UTXOs:", error);
    }
}

function processUtxos(utxos: any[]) {
    if (utxos.length === 0) {
        console.log("⚠️ No UTXOs found! Ensure you have funded the address using the TN-10 faucet.");
        return;
    }

    console.log(`✅ Found ${utxos.length} UTXOs!\n`);
    
    utxos.forEach((utxo: any, index: number) => {
        const amountKAS = utxo.utxoEntry.amount / 100000000;
        console.log(`UTXO ${index + 1}:`);
        console.log(`- TX ID: ${utxo.outpoint.transactionId}`);
        console.log(`- Index: ${utxo.outpoint.index}`);
        console.log(`- Amount: ${amountKAS} tKAS`);
        console.log(`- ScriptPubKey: ${utxo.utxoEntry.scriptPublicKey.scriptPublicKey}\n`);
    });

    if (utxos.length >= 4) {
        console.log("🎯 Excellent. You have at least 4 UTXOs to act as our visual 'traits' for the merge!");
    } else {
        console.log(`⚠️ You only have ${utxos.length} UTXOs. Go to the faucet and request funds a few more times so we have 4 separate inputs to merge.`);
    }
}

checkWallet();
