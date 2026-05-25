import { describe, it, expect } from 'vitest';
import { BinaryReader } from '../binaryReader/BinaryReader.ts';
import { StreamDecoder } from '../streamDecoder/StreamDecoder.ts';
import { EXPECTED_HEADER } from '../streamDecoder/headerFixture.ts';
import { loadHeaderThroughSaveClass } from '../streamDecoder/loadHeaderFixture.ts';
import { StreamAssembler } from './StreamAssembler.ts';
import type { DecodeStepRow } from '../../types/table.ts';

describe('StreamAssembler', () => {
  it('assembles the parsed GVAS header from decoder steps', () => {
    const decoder = new StreamDecoder(new BinaryReader(loadHeaderThroughSaveClass()));
    const assembler = new StreamAssembler(decoder);

    const header = assembler.parseHeader();

    expect(header).toEqual(EXPECTED_HEADER);
    expect(decoder.position).toBe(1207);
    expect(decoder.canStep).toBe(false);
  });

  it('pushes struct entries into an open array', () => {
    const decoder = new StreamDecoder(new BinaryReader(new Uint8Array(0)));
    const assembler = new StreamAssembler(decoder);

    const steps: DecodeStepRow[] = [
      { kind: 'openArray', name: 'items' },
      { kind: 'openStruct', name: '' },
      { kind: 'yieldName', name: 'guid' },
      { kind: 'read', opcode: 'FieldGuid', args: '', value: 'AABB', bytes: '' },
      { kind: 'yieldName', name: 'version' },
      { kind: 'read', opcode: 'FixInt32', args: '1', value: 2, bytes: '' },
      { kind: 'close' },
      { kind: 'close' },
    ];

    for (const step of steps) {
      (assembler as unknown as { applyStep(step: DecodeStepRow): void }).applyStep(step);
    }

    expect(assembler.header.items).toEqual([{ guid: 'AABB', version: 2 }]);
  });

  it('pops the stack on Close and PropNone', () => {
    const decoder = new StreamDecoder(new BinaryReader(new Uint8Array(0)));
    const assembler = new StreamAssembler(decoder);

    const steps: DecodeStepRow[] = [
      { kind: 'openStruct', name: 'inner' },
      { kind: 'yieldName', name: 'value' },
      { kind: 'read', opcode: 'FixInt32', args: '1', value: 1, bytes: '' },
      { kind: 'close' },
      { kind: 'openArray', name: 'items' },
      { kind: 'propNone' },
    ];

    for (const step of steps) {
      (assembler as unknown as { applyStep(step: DecodeStepRow): void }).applyStep(step);
    }

    expect(assembler.header.inner).toEqual({ value: 1 });
    expect(assembler.header.items).toEqual([]);
  });
});
