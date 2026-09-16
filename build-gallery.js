const fs = require('fs');

console.log('Building Pixel-Cove Gallery...');

const artTemplate = fs.readFileSync('art-program.bin', 'utf8');
const editions = JSON.parse(fs.readFileSync('editions-ledger.json', 'utf8'));
const factory = JSON.parse(fs.readFileSync('factory-ledger-v2.json', 'utf8'));

// Filter only the editions that belong to this specific art factory
const factoryEditions = editions.slice();
factoryEditions.sort((a, b) => a.serial - b.serial);

let galleryHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pixel-Cove Gallery</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        h1 { text-align: center; color: #fff; margin-bottom: 10px; }
        .subtitle { text-align: center; color: #8b949e; margin-bottom: 40px; font-size: 0.9em; }
        .factory-info { text-align: center; margin-bottom: 30px; color: #8b949e; font-size: 0.85em; word-break: break-all; background: #161b22; padding: 15px; border-radius: 8px; max-width: 800px; margin: 0 auto 40px auto; border: 1px solid #30363d; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; max-width: 1400px; margin: 0 auto; }
        .card { background: #161b22; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); display: flex; flex-direction: column; border: 1px solid #30363d; transition: transform 0.2s; }
        .card:hover { transform: translateY(-5px); border-color: #58a6ff; }
        .card iframe { width: 100%; aspect-ratio: 1/1; border: none; background: #000; }
        .card-info { padding: 20px; font-size: 0.9em; flex: 1; display: flex; flex-direction: column; }
        .card-info h3 { margin: 0 0 15px 0; color: #fff; font-size: 1.2em; display: flex; justify-content: space-between; align-items: center; }
        .card-info p { margin: 6px 0; color: #8b949e; word-break: break-all; font-size: 0.85em; }
        .card-info .label { color: #58a6ff; font-weight: 600; display: block; margin-top: 10px; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; }
        .card-info .price { color: #3fb950; font-weight: bold; font-size: 1.1em; background: #0d1117; padding: 4px 8px; border-radius: 4px; }
        .card-info .unlisted { color: #8b949e; font-style: italic; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>Pixel-Cove Generative Gallery</h1>
    <p class="subtitle">On-chain generative art powered by Kaspa Covenants</p>
    <div class="factory-info">
        <strong>Factory Covenant ID:</strong><br>
        ${factory.covenantId}<br><br>
        <strong>Total Editions Minted:</strong> ${factory.counter}
    </div>
    <div class="grid">
`;

for (const ed of factoryEditions) {
    // Inject the on-chain serial into the art template
    const artWithSerial = artTemplate.replace('window.SERIAL||0', `${ed.serial}`);
    
    // Escape the HTML for the iframe srcdoc attribute
    const escapedArt = artWithSerial
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const priceDisplay = ed.price > 0 
        ? `<span class="price">${(ed.price / 100000000).toFixed(2)} TKAS</span>` 
        : `<span class="unlisted">Not Listed</span>`;

    galleryHTML += `
        <div class="card">
            <iframe srcdoc="${escapedArt}"></iframe>
            <div class="card-info">
                <h3>Edition #${ed.serial} ${priceDisplay}</h3>
                <span class="label">Covenant ID</span>
                <p>${ed.covenantId}</p>
                <span class="label">Owner</span>
                <p>${ed.ownerIdentifier}</p>
                <span class="label">Program Hash</span>
                <p>${ed.program_hash}</p>
            </div>
        </div>
    `;
}

galleryHTML += `
    </div>
</body>
</html>
`;

fs.writeFileSync('gallery.html', galleryHTML);
console.log('✅ gallery.html generated successfully!');
console.log('Open the file in your browser to view the collection.');
