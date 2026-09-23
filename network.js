// F-04: single network profile source.
// Select with PC_NET=testnet|mainnet (default testnet).
const NET = process.env.PC_NET || 'testnet';
const PROFILES = {
  testnet: {
    rest: 'https://api-tn10.kaspa.org',
    wrpc: ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://testnet-10.kaspa.org/wrpc'],
    kascov: 'https://kascov.io/data/testnet-10',
    explorer: 'https://kascov.io/testnet-10/tx/',
    hrp: 'kaspatest', label: 'testnet-10'
  },
  mainnet: {
    rest: 'https://api.kaspa.org',
    // No hardcoded mainnet wRPC hosts on purpose: the previous list was a
    // copy-paste of the testnet-10 hosts (audit finding). Supply your own
    // trusted/full-node endpoint(s) via PC_MAINNET_WRPC (comma-separated)
    // before using anything that broadcasts over wRPC on mainnet. REST
    // (api.kaspa.org above) works with no extra config.
    wrpc: (process.env.PC_MAINNET_WRPC || '').split(',').map(s => s.trim()).filter(Boolean),
    kascov: 'https://kascov.io/data/mainnet',
    explorer: 'https://kascov.io/mainnet/tx/',
    hrp: 'kaspa', label: 'mainnet'
  }
};
if (!PROFILES[NET]) { console.error('FATAL: unknown PC_NET=' + NET); process.exit(1); }
if (NET === 'mainnet' && PROFILES.mainnet.wrpc.length === 0) {
  console.error('FATAL: PC_NET=mainnet requires PC_MAINNET_WRPC for covenant spends.'); process.exit(1);
}
module.exports = Object.assign({ NET }, PROFILES[NET]);
