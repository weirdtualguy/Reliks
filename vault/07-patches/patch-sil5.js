const fs = require('fs');
const p = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
let s = fs.readFileSync(p, 'utf8');

// Add console.log after the array length check to see what we're receiving
s = s.split("require(new_states.length == 2);").join(`require(new_states.length == 2);
        console.log("new_states[0].role =", new_states[0].role);
        console.log("new_states[0].counter =", new_states[0].counter);
        console.log("new_states[0].ownerIdentifier =", new_states[0].ownerIdentifier);
        console.log("expected role =", ROLE_EDITION);
        console.log("expected counter =", prev_state.counter);`);

fs.writeFileSync(p, s);
console.log('✅ Added diagnostic console.log to mint');
