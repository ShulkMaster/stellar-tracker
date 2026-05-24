import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StreamDecoder } from './StreamDecoder.ts';
import { BinaryReader } from '../binaryReader/BinaryReader.ts';
import { describe, it, expect } from 'vitest';

// SBS00.sav bytes 0x00–0x3C: full GVAS header through customVersionCount (61 B).
// dd if=public/SBS00.sav bs=1 count=61 2>/dev/null | xxd
const HEADER_PREFIX = new Uint8Array(readFileSync(resolve('public/SBS00.sav')).subarray(0, 61));

describe('StreamDecoder', () => {
  it('steps through the hardcoded EVAS prefix', () => {
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
    expect(decoder.canStep).toBe(true);
  });

  it('steps through the GVAS header up to customVersionCount', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));

    const steps = [
      { opcode: 'FixAscii', value: 'EVAS' },
      { opcode: 'FixInt32', value: 1 },
      { opcode: 'FixAscii', value: 'GVAS' },
      { opcode: 'FixInt32', value: 2 },
      { opcode: 'FixInt32', value: 525 },
      { opcode: 'FixUint16', value: [4, 26, 2] },
      { opcode: 'FixInt32', value: 0 },
      { opcode: 'FixString', value: '++UE4+Release-4.26' },
      { opcode: 'FixInt32', value: 3 },
      { opcode: 'FixInt32', value: 56 },
    ];

    for (const expected of steps) {
      expect(decoder.canStep).toBe(true);
      const step = decoder.next();
      expect(step.opcode).toBe(expected.opcode);
      expect(step.value).toEqual(expected.value);
    }

    expect(decoder.position).toBe(61);
    expect(decoder.canStep).toBe(false);
  });

  it('reset rewinds file position and program buffer', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));

    while (decoder.canStep) {
      decoder.next();
    }
    expect(decoder.canStep).toBe(false);

    decoder.reset();
    expect(decoder.canStep).toBe(true);
    expect(decoder.position).toBe(0);

    const step1 = decoder.next();
    expect(step1.value).toBe('EVAS');
  });
});
