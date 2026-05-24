import { StreamDecoder } from './StreamDecoder';
import { BinaryReader } from '../binaryReader/BinaryReader';
import { describe, it, expect } from 'vitest';

describe('StreamDecoder', () => {
  it('steps through the hardcoded EVAS header program', () => {
    const buf = new Uint8Array([
      0x45, 0x56, 0x41, 0x53, // "EVAS"
      0x01, 0x00, 0x00, 0x00, // int32(1)
    ]);
    const decoder = new StreamDecoder(new BinaryReader(buf));

    expect(decoder.canStep).toBe(true);

    const step1 = decoder.next();
    expect(step1).toMatchObject({
      opcode: 'FixAscii',
      args: '4',
      value: 'EVAS',
      bytes: '45 56 41 53',
    });
    expect(decoder.position).toBe(4);

    const step2 = decoder.next();
    expect(step2).toMatchObject({
      opcode: 'FixInt32',
      args: '1',
      value: 1,
      bytes: '01 00 00 00',
    });
    expect(decoder.position).toBe(8);

    expect(decoder.canStep).toBe(false);
  });

  it('reset rewinds file position and program buffer', () => {
    const buf = new Uint8Array([
      0x45, 0x56, 0x41, 0x53,
      0x01, 0x00, 0x00, 0x00,
    ]);
    const decoder = new StreamDecoder(new BinaryReader(buf));

    decoder.next();
    decoder.next();
    expect(decoder.canStep).toBe(false);

    decoder.reset();
    expect(decoder.canStep).toBe(true);
    expect(decoder.position).toBe(0);

    const step1 = decoder.next();
    expect(step1.value).toBe('EVAS');
  });
});
