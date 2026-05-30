import { describe, it, expect } from 'vitest';
import { BinaryReader } from './BinaryReader';

describe('BinaryReader', () => {
  it('should read int32 (little endian)', () => {
    const buffer = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    const reader = new BinaryReader(buffer);
    expect(reader.readInt32()).toBe(1);
    expect(reader.position).toBe(4);
  });

  it('should read int32 (negative)', () => {
    const buffer = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const reader = new BinaryReader(buffer);
    expect(reader.readInt32()).toBe(-1);
  });

  it('should read int64 (little endian)', () => {
    const buffer = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const reader = new BinaryReader(buffer);
    expect(reader.readInt64()).toBe(1n);
    expect(reader.position).toBe(8);
  });

  it('should read ASCII string', () => {
    const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const reader = new BinaryReader(buffer);
    expect(reader.readASCII(5)).toBe('Hello');
    expect(reader.position).toBe(5);
  });

  it('should report correct size and position', () => {
    const buffer = new Uint8Array(10);
    const reader = new BinaryReader(buffer);
    expect(reader.size).toBe(10);
    expect(reader.position).toBe(0);
    reader.readASCII(5);
    expect(reader.position).toBe(5);
  });

  it('should log operations when enabled', () => {
    const buffer = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43, 0x00]);
    const reader = new BinaryReader(buffer, true);

    reader.readInt32(); // 1
    reader.readASCII(3); // ABC

    const log = reader.log;
    expect(log.length).toBe(2);

    expect(log[0]).toEqual({
      type: 'Int32',
      value: 1,
      byteRange: '0-4',
      byteData: '01 00 00 00',
    });

    expect(log[1]).toEqual({
      type: 'ASCII',
      value: 'ABC',
      byteRange: '4-7',
      byteData: '41 42 43',
    });
  });

  it('should not log operations when disabled', () => {
    const buffer = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    const reader = new BinaryReader(buffer, false);

    reader.readInt32();
    expect(reader.log.length).toBe(0);
  });

  it('should log complex operations like readString', () => {
    const buffer = new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43, 0x00]);
    const reader = new BinaryReader(buffer, true);

    reader.readString(); // length 4, value "ABC\0" -> returns "ABC"

    const log = reader.log;
    // Expected: Int32 (length), ASCII (content), String (combined)
    expect(log.length).toBe(3);

    expect(log[0].type).toBe('Int32');
    expect(log[0].value).toBe(4);

    expect(log[1].type).toBe('ASCII');
    expect(log[1].value).toBe('ABC');

    expect(log[2].type).toBe('String');
    expect(log[2].value).toBe('ABC');
    expect(log[2].byteRange).toBe('0-8');
    expect(log[2].byteData).toBe('04 00 00 00 41 42 43 00');
  });

  it('should log GUID operation', () => {
    const buffer = new Uint8Array(16);
    buffer[0] = 0xAA;
    buffer[4] = 0xBB;
    buffer[8] = 0xCC;
    buffer[12] = 0xDD;
    const reader = new BinaryReader(buffer, true);

    reader.readGUID();

    const log = reader.log;
    // Expected: 4 Uint32s + 1 GUID
    expect(log.length).toBe(5);
    expect(log[4].type).toBe('GUID');
    expect(log[4].value).toBe('000000AA000000BB000000CC000000DD');
  });

  it('should throw if reading more than 1024 bytes', () => {
    const buffer = new Uint8Array(2000);
    const reader = new BinaryReader(buffer);

    expect(() => reader.readASCII(1025)).toThrow('Read length exceeded safety limit');
  });

  it('should throw if readString length exceeds limit', () => {
    const buffer = new Uint8Array([0x01, 0x04, 0x00, 0x00]); // 1025
    const reader = new BinaryReader(buffer);

    expect(() => reader.readString()).toThrow('Read length exceeded safety limit');
  });

  it('should read UTF-16 string with negative length', () => {
    // Length -4 (0xfcffffff) -> 4 characters, 8 bytes. "A\0B\0C\0\0\0"
    const buffer = new Uint8Array([
      0xfc, 0xff, 0xff, 0xff, // Length -4
      0x41, 0x00,             // 'A'
      0x42, 0x00,             // 'B'
      0x43, 0x00,             // 'C'
      0x00, 0x00              // Null terminator
    ]);
    const reader = new BinaryReader(buffer);
    expect(reader.readString()).toBe('ABC');
    expect(reader.position).toBe(12);
  });
});
