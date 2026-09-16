/**
 * encoder.ts
 * Implements 16x16 pixel packing into the 130-byte layer specification.
 * Adds the OpPushData1 prefix (0x4c 0x82) to properly format for Kaspa Scripts.
 */

export enum LayerType {
    Background = 0x00,
    BodySkin = 0x01,
    Eyes = 0x02,
    Hair = 0x03,
    Accessory = 0x04
}

/**
 * Encodes a 16x16 pixel grid into a Kaspa-compatible 130-byte trait payload.
 * * @param layerType - The category of the trait (0-4)
 * @param zIndex - Stack order (0-4, 0 being bottom)
 * @param pixels - Array of 256 integers (0-15 representing palette index)
 * @returns Hex string of the Kaspa script push operation
 */
export function encodeTraitLayer(
    layerType: LayerType,
    zIndex: number,
    pixels: number[]
): string {
    if (pixels.length !== 256) {
        throw new Error("Invalid pixel array length. Must be exactly 256 (16x16).");
    }
    
    // 130 bytes for the layer data itself
    const payload = Buffer.alloc(130);
    
    // Byte 0: Layer Type ID
    payload[0] = layerType & 0xff;
    
    // Byte 1: Z-Index stack order
    payload[1] = zIndex & 0xff;
    
    // Bytes 2..129: Packed pixel nibbles (2 pixels per byte)
    for (let i = 0; i < 256; i += 2) {
        const p1 = pixels[i] & 0x0f;
        const p2 = pixels[i + 1] & 0x0f;
        // Pack: Left pixel in high nibble, right pixel in low nibble
        payload[2 + (i >> 1)] = (p1 << 4) | p2;
    }
    
    // Framing: OpPushData1 (0x4c) + Length (0x82 = 130 bytes)
    const framing = Buffer.from([0x4c, 0x82]);
    
    return Buffer.concat([framing, payload]).toString('hex');
}

/**
 * Encodes the 16-color RGB palette into its 48-byte representation.
 * @param colors Array of 16 {r,g,b} objects
 */
export function encodePalette(colors: {r: number, g: number, b: number}[]): string {
    if (colors.length !== 16) throw new Error("Palette must contain exactly 16 colors.");
    const buf = Buffer.alloc(48);
    for (let i = 0; i < 16; i++) {
        buf[i * 3] = colors[i].r;
        buf[i * 3 + 1] = colors[i].g;
        buf[i * 3 + 2] = colors[i].b;
    }
    return buf.toString('hex');
}