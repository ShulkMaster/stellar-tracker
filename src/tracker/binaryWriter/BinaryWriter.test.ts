import { describe, it, expect } from 'vitest';
import { BinaryWriter } from './BinaryWriter';

const ASCII_DECODER = new TextDecoder('ascii');

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe('BinaryWriter', () => {
  it('writes int32 little-endian', () => {
    const w = new BinaryWriter();
    w.writeInt32(1);
    expect(w.toUint8Array()).toEqual(new Uint8Array([0x01, 0x00, 0x00, 0x00]));
    expect(w.position).toBe(4);
    expect(w.size).toBe(4);
  });

  it('writes negative int32', () => {
    const w = new BinaryWriter();
    w.writeInt32(-1);
    expect(w.toUint8Array()).toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  });

  it('writes int64 little-endian', () => {
    const w = new BinaryWriter();
    w.writeInt64(0x08de66aefae9fb50n);
    expect(w.toUint8Array()).toEqual(
      new Uint8Array([0x50, 0xfb, 0xe9, 0xfa, 0xae, 0x66, 0xde, 0x08]),
    );
  });

  it('writes ASCII without length prefix', () => {
    const w = new BinaryWriter();
    w.writeASCII('Hello');
    expect(w.toUint8Array()).toEqual(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
  });

  it('writes UTF-8 encoded text', () => {
    const w = new BinaryWriter();
    w.writeUTF8('✓');
    expect(w.toUint8Array()).toEqual(new Uint8Array([0xe2, 0x9c, 0x93]));
  });

  it('writes ASCII FString with length prefix and null terminator', () => {
    const w = new BinaryWriter();
    w.writeString('ABC');
    expect(w.toUint8Array()).toEqual(
      new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43, 0x00]),
    );
  });

  it('writes empty FString as a bare zero length', () => {
    const w = new BinaryWriter();
    w.writeString('');
    expect(w.toUint8Array()).toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
  });

  it('writes UTF-16 FString with negative length and double-null terminator', () => {
    const w = new BinaryWriter();
    w.writeString('Aé');
    expect(w.toUint8Array()).toEqual(
      new Uint8Array([
        0xfd, 0xff, 0xff, 0xff,
        0x41, 0x00,
        0xe9, 0x00,
        0x00, 0x00,
      ]),
    );
  });

  it('writes a GUID as four little-endian Uint32s', () => {
    const w = new BinaryWriter();
    w.writeGUID('000000AA000000BB000000CC000000DD');

    const expected = new Uint8Array(16);
    expected[0] = 0xaa;
    expected[4] = 0xbb;
    expected[8] = 0xcc;
    expected[12] = 0xdd;
    expect(w.toUint8Array()).toEqual(expected);
  });

  it('rejects malformed GUID input', () => {
    const w = new BinaryWriter();
    expect(() => w.writeGUID('TOO_SHORT')).toThrow('Invalid GUID length');
    expect(() => w.writeGUID('ZZZZZZZZ000000BB000000CC000000DD')).toThrow(
      'Invalid GUID hex',
    );
  });

  it('padZeros appends zero bytes and advances position', () => {
    const w = new BinaryWriter();
    w.writeByte(0xab);
    w.padZeros(3);
    w.writeByte(0xcd);
    expect(w.toUint8Array()).toEqual(new Uint8Array([0xab, 0x00, 0x00, 0x00, 0xcd]));
    expect(w.position).toBe(5);
  });

  it('padZeros with count 0 is a no-op', () => {
    const w = new BinaryWriter();
    w.padZeros(0);
    expect(w.size).toBe(0);
    expect(w.position).toBe(0);
  });

  it('padZeros rejects negative counts', () => {
    const w = new BinaryWriter();
    expect(() => w.padZeros(-1)).toThrow('padZeros count must be non-negative');
  });

  it('grows the underlying buffer beyond the initial capacity', () => {
    const w = new BinaryWriter(4);
    w.writeInt64(0x0102030405060708n);
    w.writeInt32(0x09);
    expect(w.size).toBe(12);
    expect(w.toUint8Array()).toEqual(
      new Uint8Array([
        0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01,
        0x09, 0x00, 0x00, 0x00,
      ]),
    );
  });

  it('seek allows backpatching an earlier offset without shrinking size', () => {
    const w = new BinaryWriter();
    w.writeInt32(0);
    w.writeInt32(0xdeadbeef | 0);
    w.seek(0);
    w.writeInt32(0x11223344);
    expect(w.size).toBe(8);
    expect(w.toUint8Array()).toEqual(
      new Uint8Array([0x44, 0x33, 0x22, 0x11, 0xef, 0xbe, 0xad, 0xde]),
    );
  });

  it('writeSlice copies a Uint8Array verbatim', () => {
    const w = new BinaryWriter();
    w.writeSlice(new Uint8Array([0x10, 0x20, 0x30]));
    expect(w.toUint8Array()).toEqual(new Uint8Array([0x10, 0x20, 0x30]));
  });

  it('logs operations when enabled', () => {
    const w = new BinaryWriter(64, true);
    w.writeInt32(1);
    w.writeASCII('ABC');

    expect(w.log.length).toBe(2);
    expect(w.log[0]).toEqual({
      type: 'Int32',
      value: 1,
      byteRange: '0-4',
      byteData: '01 00 00 00',
    });
    expect(w.log[1]).toEqual({
      type: 'ASCII',
      value: 'ABC',
      byteRange: '4-7',
      byteData: '41 42 43',
    });
  });

  it('does not log when disabled', () => {
    const w = new BinaryWriter(64, false);
    w.writeInt32(1);
    expect(w.log.length).toBe(0);
  });

  it('throws when writing more than the safety limit in one call', () => {
    const w = new BinaryWriter();
    expect(() => w.writeASCII('x'.repeat(1025))).toThrow('Write length exceeded safety limit');
    expect(() => w.padZeros(1025)).toThrow('Write length exceeded safety limit');
    expect(() => w.writeSlice(new Uint8Array(1025))).toThrow('Write length exceeded safety limit');
  });

  it('produces a composite buffer inspectable via DataView', () => {
    const w = new BinaryWriter();
    w.writeASCII('EVAS');
    w.writeInt32(1);
    w.writeUint16(4);
    w.writeUint16(26);
    w.writeUint16(2);
    w.writeUint32(0);
    w.writeString('++UE4+Release-4.26');
    w.writeInt64(0x08de66aefae9fb50n);
    w.writeGUID('FCF57AFA50764283B9A9E658FFA02D32');

    const bytes = w.toUint8Array();
    const view = viewOf(bytes);

    expect(bytes.byteLength).toBe(65);

    expect(ASCII_DECODER.decode(bytes.subarray(0, 4))).toBe('EVAS');
    expect(view.getInt32(4, true)).toBe(1);
    expect(view.getUint16(8, true)).toBe(4);
    expect(view.getUint16(10, true)).toBe(26);
    expect(view.getUint16(12, true)).toBe(2);
    expect(view.getUint32(14, true)).toBe(0);

    expect(view.getInt32(18, true)).toBe(19);
    expect(ASCII_DECODER.decode(bytes.subarray(22, 40))).toBe('++UE4+Release-4.26');
    expect(view.getUint8(40)).toBe(0);

    expect(view.getBigInt64(41, true)).toBe(0x08de66aefae9fb50n);

    expect(view.getUint32(49, true)).toBe(0xfcf57afa);
    expect(view.getUint32(53, true)).toBe(0x50764283);
    expect(view.getUint32(57, true)).toBe(0xb9a9e658);
    expect(view.getUint32(61, true)).toBe(0xffa02d32);
  });
});
