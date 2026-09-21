const fs = require('fs');
const LD = JSON.parse(fs.readFileSync('data/factory-ledger-v8.json', 'utf8'));
const registry = {
  network: 'mainnet',
  series: LD.series,
  factoryCovenantId: LD.C,
  editions: LD.editions.map(e => ({
    covenantId: e.cov,
    serial: e.serial,
    owner: e.owner,
    price: e.price,
    txId: e.txId,
    index: e.index,
    spk: e.spk
  }))
};
fs.writeFileSync('web/reliks-registry-mainnet.json', JSON.stringify(registry, null, 2));
console.log('✅ Generated web/reliks-registry-mainnet.json with', registry.editions.length, 'edition(s)');
