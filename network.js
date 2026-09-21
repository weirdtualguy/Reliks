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
    wrpc: ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://testnet-10.kaspa.org/wrpc'],
    kascov: 'https://kascov.io/data/mainnet',
    explorer: 'https://kascov.io/mainnet/tx/',
    hrp: 'kaspa', label: 'mainnet'
  }
};
if (!PROFILES[NET]) { console.error('FATAL: unknown PC_NET=' + NET); process.exit(1); }
module.exports = Object.assign({ NET }, PROFILES[NET]);
