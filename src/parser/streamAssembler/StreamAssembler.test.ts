import { describe, it, expect } from 'vitest';
import { BinaryReader, StreamAssembler, StreamDecoder } from 'parser';
import {
  EXPECTED_HEADER,
  HEADER_THROUGH_SAVE_CLASS_BYTES,
  loadHeaderThroughSaveClass,
  FIRST_BODY_PROPERTY,
  EXPECTED_NEW_GAME_CREATE_TIME,
  GENERIC_STRUCT_FIXTURE,
  MAP_NAME_FLOAT_FIXTURE,
  PRIMITIVE_ARRAY_FIXTURE,
  VECTOR_STRUCT_FIXTURE,
} from 'parser/streamDecoder/fixtures';
import type { DecodeStepRow } from 'types/table';
import { ENTITY } from 'types/entity';

describe('StreamAssembler', () => {
  it('assembles the parsed GVAS header from decoder steps', () => {
    const decoder = new StreamDecoder(new BinaryReader(loadHeaderThroughSaveClass()));
    const assembler = new StreamAssembler(decoder);

    const header = assembler.parseHeader();

    // toMatchObject: header (and every nested struct in customVersions)
    // carries an extra Symbol(ENTITY) property after Phase 3.
    expect(header).toMatchObject(EXPECTED_HEADER);
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

    expect(assembler.header.items).toMatchObject([{ guid: 'AABB', version: 2 }]);
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

    expect(assembler.header.inner).toMatchObject({ value: 1 });
    expect(assembler.header.items).toEqual([]);
  });

  it('stamps the ENTITY symbol on header, body struct, and map containers; arrays stay plain', () => {
    const headerBytes = loadHeaderThroughSaveClass();
    // Concatenate: real GVAS header + a body Struct + a body Map + a body Array.
    // Each individual fixture ends in its own synthetic body-None terminator
    // (9 bytes = `Int32 5` + `"None\0"`); strip the inner terminators so the
    // body's top-level property list runs through all three properties and
    // closes on the trailing fixture's final None.
    const NONE_TERMINATOR_BYTES = 9;
    const trimmedGeneric = GENERIC_STRUCT_FIXTURE.subarray(
      0, GENERIC_STRUCT_FIXTURE.length - NONE_TERMINATOR_BYTES,
    );
    const trimmedMap = MAP_NAME_FLOAT_FIXTURE.subarray(
      0, MAP_NAME_FLOAT_FIXTURE.length - NONE_TERMINATOR_BYTES,
    );
    const stitched = new Uint8Array(
      headerBytes.length + trimmedGeneric.length + trimmedMap.length + PRIMITIVE_ARRAY_FIXTURE.length,
    );
    let off = 0;
    stitched.set(headerBytes, off); off += headerBytes.length;
    stitched.set(trimmedGeneric, off); off += trimmedGeneric.length;
    stitched.set(trimmedMap, off); off += trimmedMap.length;
    stitched.set(PRIMITIVE_ARRAY_FIXTURE, off);

    const decoder = new StreamDecoder(new BinaryReader(stitched));
    const assembler = new StreamAssembler(decoder);
    const assembled = assembler.parseHeader() as Record<string, unknown> & {
      [ENTITY]?: string;
      body?: Record<string, unknown> & { [ENTITY]?: string };
    };

    // Root header is a struct.
    expect(assembled[ENTITY]).toBe('struct');
    expect(JSON.parse(JSON.stringify(assembled))).not.toHaveProperty('Symbol(stelar.entity)');

    const body = assembled.body!;
    expect(body[ENTITY]).toBe('struct');

    const innerStruct = body.Inner as Record<string, unknown> & { [ENTITY]?: string };
    expect(innerStruct[ENTITY]).toBe('struct');

    const mapContainer = body.DataMap_float as Record<string, unknown> & { [ENTITY]?: string };
    expect(mapContainer[ENTITY]).toBe('map');
    expect(Object.keys(mapContainer).sort()).toEqual(['PlayerCameraPitch', 'PlayerCameraYaw']);
    expect(JSON.stringify(mapContainer).includes('stelar.entity')).toBe(false);

    const arr = body.Lockid;
    expect(Array.isArray(arr)).toBe(true);
    // Arrays carry no ENTITY marker — `Array.isArray` already distinguishes
    // them from struct/map containers.
    expect((arr as unknown as { [ENTITY]?: string })[ENTITY]).toBeUndefined();
  });

  it('assembles trailing footer hex after body None', () => {
    const headerBytes = loadHeaderThroughSaveClass();
    const footer = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x42, 0x7d, 0x5a, 0xce]);
    const buffer = new Uint8Array(headerBytes.length + VECTOR_STRUCT_FIXTURE.length + footer.length);
    buffer.set(headerBytes, 0);
    buffer.set(VECTOR_STRUCT_FIXTURE, headerBytes.length);
    buffer.set(footer, headerBytes.length + VECTOR_STRUCT_FIXTURE.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));
    const assembler = new StreamAssembler(decoder);

    let skipRow: Extract<DecodeStepRow, { kind: 'read' }> | null = null;
    while (decoder.canStep) {
      const row = assembler.step()!;
      if (row.kind === 'read' && row.opcode === 'SkipBytes') {
        skipRow = row;
      }
    }

    const assembled = assembler.header as unknown as Record<string, unknown>;
    expect(decoder.position).toBe(buffer.length);
    expect(decoder.canStep).toBe(false);
    expect(assembled.trailingFooter).toBe('00 00 00 00 42 7D 5A CE');
    expect(skipRow).not.toBeNull();
    expect(skipRow!.value).toBe('00 00 00 00 42 7D 5A CE');
  });
});
