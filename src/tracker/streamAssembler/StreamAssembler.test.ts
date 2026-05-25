import { describe, it, expect } from 'vitest';
import { BinaryReader, StreamAssembler, StreamDecoder } from 'tracker';
import {
  EXPECTED_HEADER,
  HEADER_THROUGH_SAVE_CLASS_BYTES,
  loadHeaderThroughSaveClass,
  FIRST_BODY_PROPERTY,
  EXPECTED_NEW_GAME_CREATE_TIME,
} from 'tracker/streamDecoder/fixtures';
import type { DecodeStepRow } from 'types/table';

describe('StreamAssembler', () => {
  it('assembles the parsed GVAS header from decoder steps', () => {
    const decoder = new StreamDecoder(new BinaryReader(loadHeaderThroughSaveClass()));
    const assembler = new StreamAssembler(decoder);

    const header = assembler.parseHeader();

    expect(header).toEqual(EXPECTED_HEADER);
    expect(decoder.position).toBe(HEADER_THROUGH_SAVE_CLASS_BYTES);
    expect(decoder.canStep).toBe(false);
  });

  it('assembles NewGameCreateTime as the first body property', () => {
    const headerBytes = loadHeaderThroughSaveClass();
    const buffer = new Uint8Array(headerBytes.length + FIRST_BODY_PROPERTY.length);
    buffer.set(headerBytes, 0);
    buffer.set(FIRST_BODY_PROPERTY, headerBytes.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));
    const assembler = new StreamAssembler(decoder);

    const header = assembler.parseHeader();
    const body = (header as unknown as { body?: Record<string, unknown> }).body;

    expect(body).toBeDefined();
    expect(body!.NewGameCreateTime).toBe(EXPECTED_NEW_GAME_CREATE_TIME);
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
