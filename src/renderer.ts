/**
 * renderer.ts
 * Implements decodeAvatar and renders the on-chain data to an HTML5 Canvas.
 */

interface PaletteColor { r: number; g: number; b: number; }
interface LayerData { layerType: number; zIndex: number; pixels: number[]; }

/**
 * Extracts and composites the on-chain avatar from the 568-byte payload.
 * Fixed zIndex unpacking bug from original spec.
 */
export function decodeAvatar(avatarPayloadHex: string) {
    const buf = Buffer.from(avatarPayloadHex, 'hex');
    if (buf.length < 568) throw new Error('Payload too short (expected at least 568 bytes)');

    // 1. Unpack 48-byte palette (16 RGB colors)
    const palette: PaletteColor[] = [];
    for (let i = 0; i < 16; i++) {
        palette.push({ r: buf[i * 3], g: buf[i * 3 + 1], b: buf[i * 3 + 2] });
    }

    // 2. Unpack 130-byte layers
    const layers: LayerData[] = [];
    let offset = 48;
    while (offset + 130 <= buf.length) {
        const layerBuf = buf.subarray(offset, offset + 130);
        const layerType = layerBuf[0];
        const zIndex = layerBuf[1]; // FIXED: Extract byte at index 1
        
        const pixels = new Array(256).fill(0);
        for (let i = 0; i < 256; i += 2) {
            const byte = layerBuf[2 + (i >> 1)];
            pixels[i] = (byte >> 4) & 0x0f; // High nibble
            pixels[i + 1] = byte & 0x0f;    // Low nibble
        }
        layers.push({ layerType, zIndex, pixels });
        offset += 130;
    }

    // 3. Composite by z-index ascending
    layers.sort((a, b) => a.zIndex - b.zIndex);
    const canvasPixels = new Array(256).fill(0);
    
    for (const layer of layers) {
        for (let p = 0; p < 256; p++) {
            const colIdx = layer.pixels[p];
            if (colIdx !== 0) canvasPixels[p] = colIdx; // 0 is transparent
        }
    }

    return { palette, canvas: canvasPixels };
}

/**
 * Renders the decoded avatar data to an HTML5 Canvas element.
 * Assumes the canvas is set via CSS to `image-rendering: pixelated;` 
 * and scaled up from a 16x16 base width/height.
 */
export function renderToCanvas(
    canvasElement: HTMLCanvasElement, 
    decodedAvatar: { palette: PaletteColor[], canvas: number[] }
) {
    // Ensure the internal coordinate system matches the 16x16 grid
    canvasElement.width = 16;
    canvasElement.height = 16;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) throw new Error("Could not get 2D context");
    
    ctx.clearRect(0, 0, 16, 16);
    
    const { palette, canvas } = decodedAvatar;
    
    for (let i = 0; i < 256; i++) {
        const colorIndex = canvas[i];
        if (colorIndex === 0) continue; // Skip transparency
        
        const color = palette[colorIndex];
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        
        const x = i % 16;
        const y = Math.floor(i / 16);
        
        // Draw the 1x1 pixel on the 16x16 grid
        ctx.fillRect(x, y, 1, 1);
    }
}