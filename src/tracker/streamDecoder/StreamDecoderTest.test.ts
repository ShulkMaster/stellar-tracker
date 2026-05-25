import { StreamDecoder } from './StreamDecoder.ts';
import { BinaryReader } from '../binaryReader/BinaryReader.ts';
import { HEADER_PREFIX } from './headerFixture.ts';
import { describe, it, expect } from 'vitest';

describe('StreamDecoder', () => {
  it('yields field names before header reads', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));

    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'stelarHeader' });
    expect(decoder.next()).toMatchObject({
      kind: 'read',
      opcode: 'FixAscii',
      value: 'EVAS',
    });
    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'stelarVersion' });
    expect(decoder.next()).toMatchObject({
      kind: 'read',
      opcode: 'FixInt32',
      value: 1,
    });
  });

  it('steps through the GVAS header up to customVersions array open', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));

    while (decoder.canStep) {
      decoder.next();
    }

    expect(decoder.position).toBe(61);
    expect(decoder.canStep).toBe(false);
  });

  it('ends with OpenArray customVersions after customVersionCount', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));
    let lastStep = decoder.next();

    while (decoder.canStep) {
      lastStep = decoder.next();
    }

    expect(lastStep).toEqual({ kind: 'openArray', name: 'customVersions' });
  });

  it('reset rewinds file position and program buffer', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));

    while (decoder.canStep) {
      decoder.next();
    }

    decoder.reset();
    expect(decoder.canStep).toBe(true);
    expect(decoder.position).toBe(0);
    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'stelarHeader' });
  });
});
