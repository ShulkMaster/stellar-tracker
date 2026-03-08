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

  it('should read UTF-8 string', () => {
    const buffer = new Uint8Array([0xe2, 0x9c, 0x93]); // Check mark
    const reader = new BinaryReader(buffer);
    expect(reader.readUTF8(3)).toBe('✓');
    expect(reader.position).toBe(3);
  });

  it('should report correct size and position', () => {
    const buffer = new Uint8Array(10);
    const reader = new BinaryReader(buffer);
    expect(reader.size).toBe(10);
    expect(reader.position).toBe(0);
    reader.readASCII(5);
    expect(reader.position).toBe(5);
  });

  it('should create from stream', async () => {
    const buffer = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(buffer.slice(0, 2));
        controller.enqueue(buffer.slice(2, 4));
        controller.close();
      },
    });

    const reader = await BinaryReader.fromStream(
      4,
      stream as ReadableStream<Uint8Array<ArrayBuffer>>,
    );
    expect(reader.size).toBe(4);
    expect(reader.readInt32()).toBe(0x04030201);
  });
});
