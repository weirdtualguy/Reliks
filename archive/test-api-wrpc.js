const url = 'wss://api.kaspa.org';
console.log('Testing:', url);
const ws = new (require('ws'))(url, { rejectUnauthorized: false });
const t = setTimeout(() => { console.log('❌ TIMEOUT (10s)'); ws.terminate(); process.exit(1); }, 10000);
ws.on('open', () => { console.log('✅ OPEN - This endpoint works!'); clearTimeout(t); ws.close(); process.exit(0); });
ws.on('error', (e) => { console.log('❌ ERROR:', e.message); clearTimeout(t); process.exit(1); });
