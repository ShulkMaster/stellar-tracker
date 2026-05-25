import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { StreamDecoder } from './StreamDecoder.ts';
import { BinaryReader } from '../binaryReader/BinaryReader.ts';
import { HEADER_PREFIX } from './headerFixture.ts';
import { loadHeaderThroughSaveClass } from './loadHeaderFixture.ts';

const fixtureDir = dirname(fileURLToPath(import.meta.url));

// SBS00.sav 0x3D–0x50: first custom version entry (GUID + version Int32).
const FIRST_CUSTOM_VERSION = readFileSync(
  join(fixtureDir, 'firstCustomVersion.bin'),
);

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

  it('steps through fixed header fields through customVersionCount', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));

    while (decoder.position < 61) {
      decoder.next();
    }

    expect(decoder.position).toBe(61);
    expect(decoder.canStep).toBe(true);
  });

  it('opens customVersions with count and pushes a frame for element iteration', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));
    let lastStep = decoder.next();

    while (decoder.position < 61) {
      lastStep = decoder.next();
    }

    expect(lastStep).toMatchObject({
      kind: 'read',
      opcode: 'FixInt32',
      value: 56,
    });

    lastStep = decoder.next();
    expect(lastStep).toEqual({ kind: 'openArray', name: 'customVersions', count: 56 });
    expect(decoder.position).toBe(61);
    expect(decoder.canStep).toBe(true);
    expect(decoder.next()).toEqual({ kind: 'openStruct', name: '', index: 0 });
  });

  it('reads the first custom version GUID and version after openArray', () => {
  // Header prefix + first custom version entry only (81 B total).
    const buffer = new Uint8Array(HEADER_PREFIX.length + FIRST_CUSTOM_VERSION.length);
    buffer.set(HEADER_PREFIX, 0);
    buffer.set(FIRST_CUSTOM_VERSION, HEADER_PREFIX.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));

    while (decoder.canStep) {
      const step = decoder.next();
      if (step.kind === 'openArray' && step.name === 'customVersions') {
        break;
      }
    }

    expect(decoder.next()).toEqual({ kind: 'openStruct', name: '', index: 0 });
    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'guid', index: 0 });
    expect(decoder.next()).toMatchObject({
      kind: 'read',
      opcode: 'FieldGuid',
      value: 'FCF57AFA50764283B9A9E658FFA02D32',
      index: 0,
    });
    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'version', index: 0 });
    expect(decoder.next()).toMatchObject({
      kind: 'read',
      opcode: 'FixInt32',
      value: 68,
      index: 0,
    });
    expect(decoder.next()).toEqual({ kind: 'close', index: 0 });
    expect(decoder.position).toBe(81);
  });

  it('steps through the full header through saveClassName', () => {
    const decoder = new StreamDecoder(new BinaryReader(loadHeaderThroughSaveClass()));

    while (decoder.canStep) {
      decoder.next();
    }

    expect(decoder.position).toBe(1207);
    expect(decoder.canStep).toBe(false);
  });

  it('reset rewinds file position and program buffer', () => {
    const decoder = new StreamDecoder(new BinaryReader(loadHeaderThroughSaveClass()));

    while (decoder.canStep) {
      decoder.next();
    }

    decoder.reset();
    expect(decoder.canStep).toBe(true);
    expect(decoder.position).toBe(0);
    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'stelarHeader' });
  });
});
