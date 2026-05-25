import { describe, it, expect } from 'vitest';
import { BinaryReader } from '../binaryReader/BinaryReader.ts';
import { StreamDecoder } from '../streamDecoder/StreamDecoder.ts';
import { EXPECTED_HEADER, HEADER_PREFIX } from '../streamDecoder/headerFixture.ts';
import { StreamAssembler } from './StreamAssembler.ts';
import type { DecodeStepRow } from '../../types/table.ts';

describe('StreamAssembler', () => {
  it('assembles the parsed GVAS header from decoder steps', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));
    const assembler = new StreamAssembler(decoder);

    const header = assembler.parseHeader();

    expect(header).toEqual(EXPECTED_HEADER);
    expect(decoder.position).toBe(61);
    expect(decoder.canStep).toBe(false);
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
