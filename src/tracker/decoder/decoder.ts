const HEX = '0123456789ABCDEF';
const ASCII_DECODER = new TextDecoder('ascii');

export function toHex(bytes: Uint8Array<ArrayBufferLike>): string {
  const len = bytes.length;

  if (len === 0)
    return "";

  const out = new Uint8Array(len * 3 - 1);

  let p = 0;
  let i = 0;

  // Write all bytes except the last one
  for (; i < len - 1; i++) {
    const b = bytes[i];

    out[p++] = HEX.charCodeAt(b >>> 4);
    out[p++] = HEX.charCodeAt(b & 0x0F);
    out[p++] = 0x20; // ' '
  }

  // Write final byte without trailing space
  const b = bytes[i];

  out[p++] = HEX.charCodeAt(b >>> 4);
  out[p++] = HEX.charCodeAt(b & 0x0F);

  return ASCII_DECODER.decode(out);
}