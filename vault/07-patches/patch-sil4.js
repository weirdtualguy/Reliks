const fs = require('fs');
const p = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('    #[covenant(binding = auth, mode = transition, from = 1, to = 2)]');
const end = s.indexOf('    #[covenant.singleton(mode = transition)]\n    function list');
if (start < 0 || end < 0) { console.log('❌ markers not found'); process.exit(1); }
const mint = [
'    #[covenant(binding = auth, mode = verification, from = 1, to = 2)]',
'    function mint(State prev_state, State[] new_states, byte[32] buyerIdentifier, byte buyerScheme, int paymentOutIdx) {',
'        require(prev_state.role == ROLE_SERIES);',
'        require(prev_state.counter < prev_state.cap);',
'        byte[] artistSpk = byte[](new ScriptPubKeyP2PK(pubkey(prev_state.artist)));',
'        require(tx.outputs[paymentOutIdx].value >= prev_state.price);',
'        require(tx.outputs[paymentOutIdx].scriptPubKey == artistSpk);',
'        require(new_states.length == 2);',
'        require(new_states[0].role == ROLE_EDITION);',
'        require(new_states[0].counter == prev_state.counter);',
'        require(new_states[0].ownerIdentifier == buyerIdentifier);',
'        require(new_states[1].role == ROLE_SERIES);',
'        require(new_states[1].counter == prev_state.counter + 1);',
'    }',
'', ''].join('\n');
fs.writeFileSync(p, s.slice(0, start) + mint + s.slice(end));
console.log('✅ mint → mode=verification with State[] new_states (caller pushes)');
