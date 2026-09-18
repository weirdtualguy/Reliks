fetch('https://api-tn10.kaspa.org/transactions/b26cf6c3a1d9d86a86f79b8c5e04742ac50955982d1465305f1320309162dee7')
  .then(r => r.json())
  .then(t => {
    if (!t.inputs) {
      console.log('API Keys:', Object.keys(t));
      console.log('Raw:', JSON.stringify(t).substring(0, 200));
    } else {
      console.log('✅ Reveal Verified:', t.inputs.length, 'inputs. Input 0 script size:', t.inputs[0].signatureScript ? t.inputs[0].signatureScript.length / 2 : 'missing sigScript key');
    }
  }).catch(e => console.error('Fetch error:', e.message));
