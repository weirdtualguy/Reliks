const fs = require('fs');
const p = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('    #[covenant(binding = auth, mode = verification, from = 1, to = 2)]');
const end = s.indexOf('    #[covenant.singleton(mode = transition)]\n    function list');
if (start < 0 || end < 0) { console.log('❌ markers not found'); process.exit(1); }
const mint = [
'    #[covenant(binding = auth, mode = transition, from = 1, to = 2)]',
'    function mint(State prev_state, byte[32] buyerIdentifier, byte buyerScheme, int paymentOutIdx) : (State, State) {',
'        require(prev_state.role == ROLE_SERIES);',
'        require(prev_state.counter < prev_state.cap);',
'        byte[] artistSpk = byte[](new ScriptPubKeyP2PK(pubkey(prev_state.artist)));',
'        require(tx.outputs[paymentOutIdx].value >= prev_state.price);',
'        require(tx.outputs[paymentOutIdx].scriptPubKey == artistSpk);',
'        return (State { slot: prev_state.slot, artist: prev_state.artist, price: 0, cap: prev_state.cap,',
'                role: ROLE_EDITION, counter: prev_state.counter, ownerIdentifier: buyerIdentifier, identifierType: buyerScheme },',
'            State { slot: prev_state.slot, artist: prev_state.artist, price: prev_state.price, cap: prev_state.cap,',
'                role: ROLE_SERIES, counter: prev_state.counter + 1, ownerIdentifier: prev_state.ownerIdentifier, identifierType: prev_state.identifierType });',
'    }',
'', ''].join('\n');
fs.writeFileSync(p, s.slice(0, start) + mint + s.slice(end));
console.log('✅ mint → mode=transition with tuple return (State, State)');
