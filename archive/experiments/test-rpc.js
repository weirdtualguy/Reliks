const { RpcClient, NetworkId } = require('kaspa-wasm');

async function test() {
  try {
    console.log('Attempting connection with explicit URL...');
    const rpc = new RpcClient({
      url: "wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json",
      networkId: NetworkId.Testnet10,
      encoding: "borsh" // or "json"
    });
    await rpc.connect();
    console.log('✅ Connected!');
    const info = await rpc.getServerInfo();
    console.log('Server info:', info);
    await rpc.disconnect();
  } catch (e) {
    console.error('❌ Failed:', e.message);
  }
}
test();
