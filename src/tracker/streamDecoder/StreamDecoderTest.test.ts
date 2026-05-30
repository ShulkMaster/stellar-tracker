import { describe, it, expect } from 'vitest';
import { BinaryReader, StreamDecoder, StreamAssembler } from 'tracker';
import { ENTITY } from 'types/entity';
import {
  HEADER_PREFIX,
  HEADER_PREFIX_BYTES,
  HEADER_THROUGH_SAVE_CLASS_BYTES,
  CUSTOM_VERSION_COUNT,
  CUSTOM_VERSION_ENTRY_BYTES,
  EXPECTED_CUSTOM_VERSIONS,
  loadHeaderThroughSaveClass,
  loadFirstCustomVersion,
  FIRST_BODY_PROPERTY,
  FIRST_BODY_PROPERTY_BYTES,
  FIRST_BODY_PROPERTY_TAG_BYTES,
  EXPECTED_NEW_GAME_CREATE_TIME,
  VECTOR_STRUCT_FIXTURE,
  ROTATOR_STRUCT_FIXTURE,
  GUID_STRUCT_FIXTURE,
  DATETIME_STRUCT_FIXTURE,
  GENERIC_STRUCT_FIXTURE,
  EXPECTED_VECTOR,
  EXPECTED_ROTATOR,
  EXPECTED_GUID_HEX,
  EXPECTED_DATETIME_TICKS,
  EXPECTED_GENERIC_STRUCT,
  PRIMITIVE_ARRAY_FIXTURE,
  NAME_ARRAY_FIXTURE,
  EMPTY_ARRAY_FIXTURE,
  STRUCT_ARRAY_FIXTURE,
  EXPECTED_STRUCT_ARRAY,
  EXPECTED_LOCKID_VALUES,
  EXPECTED_ITEM_QUICK_SLOT_VALUES,
  MAP_NAME_FLOAT_FIXTURE,
  MAP_NAME_STRUCT_FIXTURE,
  MAP_INT_INT_EMPTY_FIXTURE,
  MAP_INT_STRUCT_FIXTURE,
  VECTOR_BUFFER_DATA_MAP_FIXTURE,
  EXPECTED_MAP_NAME_FLOAT,
  EXPECTED_MAP_NAME_STRUCT,
  EXPECTED_MAP_INT_STRUCT,
  EXPECTED_VECTOR_BUFFER_DATA,
  SET_NAME_FIXTURE,
  EXPECTED_ITEM_OTAINE_SET,
  EFFECT_LIST_FIXTURE,
  EXPECTED_EFFECT_LIST_COUNT,
  PROGRESS_QUEST_ONE_ELEMENT_FIXTURE,
  PROGRESS_QUEST_TWO_ELEMENT_FIXTURE,
  PROGRESS_QUEST_FOUR_ELEMENT_FIXTURE,
  EXPECTED_QUEST_ALIASES,
} from './fixtures';
import type { DecodeStepRow } from 'types/table';

function decodeBody(fixtureBytes: Uint8Array): {
  body: Record<string, unknown>;
  decoder: StreamDecoder;
  totalBytes: number;
} {
  const header = loadHeaderThroughSaveClass();
  const buffer = new Uint8Array(header.length + fixtureBytes.length);
  buffer.set(header, 0);
  buffer.set(fixtureBytes, header.length);

  const decoder = new StreamDecoder(new BinaryReader(buffer));
  const assembler = new StreamAssembler(decoder);
  const assembled = assembler.parseHeader() as Record<string, unknown>;
  return {
    body: assembled.body as Record<string, unknown>,
    decoder,
    totalBytes: buffer.length,
  };
}

const FIRST_CUSTOM_VERSION = loadFirstCustomVersion();

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

    while (decoder.position < HEADER_PREFIX_BYTES) {
      decoder.next();
    }

    expect(decoder.position).toBe(HEADER_PREFIX_BYTES);
    expect(decoder.canStep).toBe(true);
  });

  it('opens customVersions with count and pushes a frame for element iteration', () => {
    const decoder = new StreamDecoder(new BinaryReader(HEADER_PREFIX));
    let lastStep = decoder.next();

    while (decoder.position < HEADER_PREFIX_BYTES) {
      lastStep = decoder.next();
    }

    expect(lastStep).toMatchObject({
      kind: 'read',
      opcode: 'FixInt32',
      value: CUSTOM_VERSION_COUNT,
    });

    lastStep = decoder.next();
    expect(lastStep).toEqual({
      kind: 'openArray',
      name: 'customVersions',
      count: CUSTOM_VERSION_COUNT,
    });
    expect(decoder.position).toBe(HEADER_PREFIX_BYTES);
    expect(decoder.canStep).toBe(true);
    expect(decoder.next()).toEqual({ kind: 'openStruct', name: '', index: 0 });
  });

  it('reads the first custom version GUID and version after openArray', () => {
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

    const firstEntry = EXPECTED_CUSTOM_VERSIONS[0];
    expect(decoder.next()).toEqual({ kind: 'openStruct', name: '', index: 0 });
    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'guid', index: 0 });
    expect(decoder.next()).toMatchObject({
      kind: 'read',
      opcode: 'FieldGuid',
      value: firstEntry.guid,
      index: 0,
    });
    expect(decoder.next()).toEqual({ kind: 'yieldName', name: 'version', index: 0 });
    expect(decoder.next()).toMatchObject({
      kind: 'read',
      opcode: 'FixInt32',
      value: firstEntry.version,
      index: 0,
    });
    expect(decoder.next()).toEqual({ kind: 'close', index: 0 });
    expect(decoder.position).toBe(HEADER_PREFIX_BYTES + CUSTOM_VERSION_ENTRY_BYTES);
  });

  it('steps through the full header through saveClassName', () => {
    const decoder = new StreamDecoder(new BinaryReader(loadHeaderThroughSaveClass()));

    while (decoder.canStep) {
      decoder.next();
    }

    // EnterBody is a no-op at EOF (header-only fixture), so the queue drains
    // cleanly and position lands exactly on the saveClassName boundary.
    expect(decoder.position).toBe(HEADER_THROUGH_SAVE_CLASS_BYTES);
    expect(decoder.canStep).toBe(false);
  });

  it('parses the first body property NewGameCreateTime as Int64Property', () => {
    const header = loadHeaderThroughSaveClass();
    const buffer = new Uint8Array(header.length + FIRST_BODY_PROPERTY.length);
    buffer.set(header, 0);
    buffer.set(FIRST_BODY_PROPERTY, header.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));

    let int64Read: Extract<ReturnType<StreamDecoder['next']>, { kind: 'read' }> | null = null;
    let int64ReadPosition = 0;
    let lastYieldedNameBeforeInt64: string | null = null;
    let pendingName: string | null = null;

    while (decoder.canStep) {
      const step = decoder.next();
      if (step.kind === 'yieldName') {
        pendingName = step.name;
      } else if (step.kind === 'read' && step.opcode === 'FieldInt64') {
        int64Read = step;
        lastYieldedNameBeforeInt64 = pendingName;
        int64ReadPosition = decoder.position;
      }
    }

    expect(lastYieldedNameBeforeInt64).toBe('NewGameCreateTime');
    expect(int64Read).not.toBeNull();
    expect(int64Read!.value).toBe(EXPECTED_NEW_GAME_CREATE_TIME);
    // After the Int64 value, the reader is positioned exactly at the end of
    // the NewGameCreateTime tag (the 57-byte tag, before the synthetic None).
    expect(int64ReadPosition).toBe(HEADER_THROUGH_SAVE_CLASS_BYTES + FIRST_BODY_PROPERTY_TAG_BYTES);
    // After the synthetic terminator the decoder drains cleanly.
    expect(decoder.position).toBe(HEADER_THROUGH_SAVE_CLASS_BYTES + FIRST_BODY_PROPERTY_BYTES);
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

  // ───────────────────────── Phase 1 — plain structs ──────────────────────────

  it('decodes a Vector StructProperty as { x, y, z } and uses propName as the assembler key', () => {
    const { body, decoder, totalBytes } = decodeBody(VECTOR_STRUCT_FIXTURE);

    expect(body.Pos).toMatchObject(EXPECTED_VECTOR);
    // Container must be keyed by property name, not StructType (Phase 1 bug fix).
    expect(body).not.toHaveProperty('Vector');
    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('emits openStruct with propName (not structType) for Vector and reads 3 floats', () => {
    const header = loadHeaderThroughSaveClass();
    const buffer = new Uint8Array(header.length + VECTOR_STRUCT_FIXTURE.length);
    buffer.set(header, 0);
    buffer.set(VECTOR_STRUCT_FIXTURE, header.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));

    const openStructNames: string[] = [];
    const yieldNamesAfterPos: string[] = [];
    const floatReads: number[] = [];
    let sawCloseAfterFloats = false;
    let sawPropNoneTerminator = false;
    let posYielded = false;

    while (decoder.canStep) {
      const step = decoder.next();
      if (step.kind === 'openStruct') {
        openStructNames.push(step.name);
      } else if (step.kind === 'yieldName') {
        if (step.name === 'Pos') posYielded = true;
        else if (posYielded) yieldNamesAfterPos.push(step.name);
      } else if (step.kind === 'read' && step.opcode === 'FieldFloat32') {
        floatReads.push(step.value as number);
      } else if (step.kind === 'close' && floatReads.length === 3) {
        sawCloseAfterFloats = true;
      } else if (step.kind === 'propNone') {
        sawPropNoneTerminator = true;
      }
    }

    expect(openStructNames).toContain('Pos');
    expect(openStructNames).not.toContain('Vector');
    expect(yieldNamesAfterPos.slice(0, 3)).toEqual(['x', 'y', 'z']);
    expect(floatReads).toEqual([
      EXPECTED_VECTOR.x,
      EXPECTED_VECTOR.y,
      EXPECTED_VECTOR.z,
    ]);
    expect(sawCloseAfterFloats).toBe(true);
    expect(sawPropNoneTerminator).toBe(true);
  });

  it('decodes a Rotator StructProperty as { pitch, yaw, roll }', () => {
    const { body, decoder, totalBytes } = decodeBody(ROTATOR_STRUCT_FIXTURE);

    expect(body.Rot).toMatchObject(EXPECTED_ROTATOR);
    expect(body).not.toHaveProperty('Rotator');
    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes a Guid StructProperty as a single 32-char hex string (no sub-object)', () => {
    const { body, decoder, totalBytes } = decodeBody(GUID_STRUCT_FIXTURE);

    expect(body.Id).toBe(EXPECTED_GUID_HEX);
    // Guid is a primitive value — no nested object should appear.
    expect(typeof body.Id).toBe('string');
    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes a DateTime StructProperty as a single bigint (no sub-object)', () => {
    const { body, decoder, totalBytes } = decodeBody(DATETIME_STRUCT_FIXTURE);

    expect(body.Created).toBe(EXPECTED_DATETIME_TICKS);
    expect(typeof body.Created).toBe('bigint');
    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes a generic StructProperty as a nested property list and resumes the parent body', () => {
    const { body, decoder, totalBytes } = decodeBody(GENERIC_STRUCT_FIXTURE);

    expect(body.Inner).toMatchObject(EXPECTED_GENERIC_STRUCT);
    // The outer fixture has a trailing body `None`; reaching it cleanly proves
    // `_listDepth` returned to baseline after the inner None.
    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  // ───────────────────────── Phase 2 — scalar arrays ──────────────────────────

  it('decodes a UInt32Property[7] ArrayProperty end-to-end with one read per element', () => {
    const header = loadHeaderThroughSaveClass();
    const buffer = new Uint8Array(header.length + PRIMITIVE_ARRAY_FIXTURE.length);
    buffer.set(header, 0);
    buffer.set(PRIMITIVE_ARRAY_FIXTURE, header.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));
    const assembler = new StreamAssembler(decoder);

    let openArrayName: string | null = null;
    let itemCountTagHeader: number | null = null;
    const intReads: number[] = [];
    let sawCloseAfterIntReads = false;
    let sawBodyTerminator = false;

    while (decoder.canStep) {
      const step = assembler.step()!;
      if (step.kind === 'openArray' && step.name === 'Lockid') {
        openArrayName = step.name;
      } else if (step.kind === 'tagHeader' && step.field === 'itemCount') {
        itemCountTagHeader = step.value as number;
      } else if (
        step.kind === 'read'
        && step.opcode === 'FixInt32'
        && openArrayName !== null
        && intReads.length < EXPECTED_LOCKID_VALUES.length
      ) {
        intReads.push(step.value as number);
      } else if (
        step.kind === 'close'
        && intReads.length === EXPECTED_LOCKID_VALUES.length
        && !sawCloseAfterIntReads
      ) {
        sawCloseAfterIntReads = true;
      } else if (step.kind === 'propNone') {
        sawBodyTerminator = true;
      }
    }

    expect(openArrayName).toBe('Lockid');
    expect(itemCountTagHeader).toBe(EXPECTED_LOCKID_VALUES.length);
    expect(intReads).toEqual([...EXPECTED_LOCKID_VALUES]);
    expect(sawCloseAfterIntReads).toBe(true);
    expect(sawBodyTerminator).toBe(true);
    expect(decoder.position).toBe(buffer.length);

    const body = (assembler.header as unknown as Record<string, unknown>).body as Record<string, unknown>;
    expect(body.Lockid).toEqual([...EXPECTED_LOCKID_VALUES]);
  });

  it('decodes a NameProperty[6] ArrayProperty including a literal "None" element without confusing the tag-name terminator', () => {
    const { body, decoder, totalBytes } = decodeBody(NAME_ARRAY_FIXTURE);

    expect(body.ItemQuickSlot).toEqual([...EXPECTED_ITEM_QUICK_SLOT_VALUES]);
    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes an empty ArrayProperty (itemCount=0) without pushing an arrayIter frame', () => {
    const header = loadHeaderThroughSaveClass();
    const buffer = new Uint8Array(header.length + EMPTY_ARRAY_FIXTURE.length);
    buffer.set(header, 0);
    buffer.set(EMPTY_ARRAY_FIXTURE, header.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));
    const assembler = new StreamAssembler(decoder);

    let itemCount: number | null = null;
    let openArraySeen = false;
    let elementReadsAfterOpenArray = 0;
    let closeAfterOpenArray = false;

    while (decoder.canStep) {
      const step = assembler.step()!;
      if (step.kind === 'tagHeader' && step.field === 'itemCount') {
        itemCount = step.value as number;
      } else if (step.kind === 'openArray' && step.name === 'EmptyArr') {
        openArraySeen = true;
      } else if (step.kind === 'read' && openArraySeen && !closeAfterOpenArray) {
        elementReadsAfterOpenArray += 1;
      } else if (step.kind === 'close' && openArraySeen && !closeAfterOpenArray) {
        closeAfterOpenArray = true;
      }
    }

    expect(itemCount).toBe(0);
    expect(openArraySeen).toBe(true);
    expect(elementReadsAfterOpenArray).toBe(0);
    expect(closeAfterOpenArray).toBe(true);
    expect(decoder.position).toBe(buffer.length);

    const body = (assembler.header as unknown as Record<string, unknown>).body as Record<string, unknown>;
    expect(body.EmptyArr).toEqual([]);
  });

  it('decodes a StructProperty[N] ArrayProperty with per-element InnerTags', () => {
    const { body, decoder, totalBytes } = decodeBody(STRUCT_ARRAY_FIXTURE);

    const arr = body.StructArr as Record<string, unknown>[];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(EXPECTED_STRUCT_ARRAY.length);
    for (let i = 0; i < EXPECTED_STRUCT_ARRAY.length; i++) {
      expect(arr[i]).toMatchObject(EXPECTED_STRUCT_ARRAY[i]!);
    }
    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes SBS00 EffectList empty StructProperty array slice to EOF', () => {
    const { body, decoder, totalBytes } = decodeBody(EFFECT_LIST_FIXTURE);
    const arr = body.EffectList as unknown[];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(EXPECTED_EFFECT_LIST_COUNT);
    expect(decoder.position).toBe(totalBytes);
    expect(decoder.canStep).toBe(false);
  });

  it('decodes SBS00 ProgressQuestList first struct element slice to EOF', () => {
    const { body, decoder, totalBytes } = decodeBody(PROGRESS_QUEST_ONE_ELEMENT_FIXTURE);
    const arr = body.ProgressQuestList as Record<string, unknown>[];
    expect(arr).toHaveLength(1);
    expect(arr[0]).toBeDefined();
    expect(decoder.position).toBe(totalBytes);
    expect(decoder.canStep).toBe(false);
  });

  it('decodes first two ProgressQuestList shared-header struct elements', () => {
    const { body, decoder, totalBytes } = decodeBody(PROGRESS_QUEST_TWO_ELEMENT_FIXTURE);
    const arr = body.ProgressQuestList as Record<string, unknown>[];
    expect(arr).toHaveLength(2);
    expect(arr[0]?.QuestAlias).toBe(EXPECTED_QUEST_ALIASES[0]);
    expect(arr[1]?.QuestAlias).toBe(EXPECTED_QUEST_ALIASES[1]);
    expect(decoder.position).toBe(totalBytes);
    expect(decoder.canStep).toBe(false);
  });

  it('decodes ProgressQuestList through the 0x64bc element boundary', () => {
    const { body, decoder, totalBytes } = decodeBody(PROGRESS_QUEST_FOUR_ELEMENT_FIXTURE);
    const arr = body.ProgressQuestList as Record<string, unknown>[];
    expect(arr).toHaveLength(4);
    expect(arr.map((entry) => entry.QuestAlias)).toEqual([...EXPECTED_QUEST_ALIASES]);
    expect(decoder.position).toBe(totalBytes);
    expect(decoder.canStep).toBe(false);
  });

  // ──────────────────────── Phase 3 — MapProperty ─────────────────────────────

  it('decodes a Map<Name, Float> end-to-end and stamps the ENTITY symbol on the container', () => {
    const { body, decoder, totalBytes } = decodeBody(MAP_NAME_FLOAT_FIXTURE);

    const map = body.DataMap_float as Record<string, unknown>;
    expect(map).toBeDefined();
    for (const [k, v] of Object.entries(EXPECTED_MAP_NAME_FLOAT)) {
      expect(map[k]).toBeCloseTo(v, 5);
    }
    // ENTITY marker is invisible to string-key enumeration.
    expect(Object.keys(map).sort()).toEqual(Object.keys(EXPECTED_MAP_NAME_FLOAT).sort());
    expect((map as unknown as { [ENTITY]?: string })[ENTITY]).toBe('map');
    expect(JSON.parse(JSON.stringify(map))).not.toHaveProperty('Symbol(stelar.entity)');

    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes a Map<Name, Struct> with two entries; container is map, each value is struct', () => {
    const { body, decoder, totalBytes } = decodeBody(MAP_NAME_STRUCT_FIXTURE);

    const map = body.MyMap as Record<string, unknown>;
    expect(map).toBeDefined();
    expect((map as unknown as { [ENTITY]?: string })[ENTITY]).toBe('map');
    for (const [k, expected] of Object.entries(EXPECTED_MAP_NAME_STRUCT)) {
      const entry = map[k] as Record<string, unknown>;
      expect(entry).toBeDefined();
      expect((entry as unknown as { [ENTITY]?: string })[ENTITY]).toBe('struct');
      expect(entry.HP).toBeCloseTo(expected.HP, 5);
    }
    expect(Object.keys(map).sort()).toEqual(Object.keys(EXPECTED_MAP_NAME_STRUCT).sort());

    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes an empty Map<Int, Int> with no element steps between OpenMap and Close', () => {
    const header = loadHeaderThroughSaveClass();
    const buffer = new Uint8Array(header.length + MAP_INT_INT_EMPTY_FIXTURE.length);
    buffer.set(header, 0);
    buffer.set(MAP_INT_INT_EMPTY_FIXTURE, header.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));
    const assembler = new StreamAssembler(decoder);

    let openMapSeen = false;
    let entryCountTagHeader: number | null = null;
    let elementStepsAfterOpenMap = 0;
    let sawCloseAfterOpenMap = false;

    while (decoder.canStep) {
      const step = assembler.step()!;
      if (step.kind === 'tagHeader' && step.field === 'entryCount') {
        entryCountTagHeader = step.value as number;
      } else if (step.kind === 'openMap' && step.name === 'TaskValueMap') {
        openMapSeen = true;
      } else if (openMapSeen && !sawCloseAfterOpenMap) {
        if (step.kind === 'close') {
          sawCloseAfterOpenMap = true;
        } else if (step.kind !== 'tagHeader') {
          // tagHeader rows (mapKey) would prove an entry started — none should
          // appear between OpenMap and Close for an empty map.
          elementStepsAfterOpenMap += 1;
        }
      }
    }

    expect(entryCountTagHeader).toBe(0);
    expect(openMapSeen).toBe(true);
    expect(elementStepsAfterOpenMap).toBe(0);
    expect(sawCloseAfterOpenMap).toBe(true);
    expect(decoder.position).toBe(buffer.length);

    const assembledBody = (assembler.header as unknown as Record<string, unknown>).body as Record<string, unknown>;
    const map = assembledBody.TaskValueMap as Record<string, unknown>;
    expect(Object.keys(map)).toEqual([]);
    expect((map as unknown as { [ENTITY]?: string })[ENTITY]).toBe('map');
  });

  it('decodes a Map<Int, Struct> end-to-end with stringified integer keys', () => {
    const { body, decoder, totalBytes } = decodeBody(MAP_INT_STRUCT_FIXTURE);

    const map = body.Equipment as Record<string, unknown>;
    expect(map).toBeDefined();
    expect((map as unknown as { [ENTITY]?: string })[ENTITY]).toBe('map');
    for (const [k, expected] of Object.entries(EXPECTED_MAP_INT_STRUCT)) {
      const entry = map[k] as Record<string, unknown>;
      expect(entry).toBeDefined();
      expect((entry as unknown as { [ENTITY]?: string })[ENTITY]).toBe('struct');
      expect(entry.HP).toBeCloseTo(expected.HP, 5);
    }

    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('decodes VectorBufferData Map<Byte, Struct> entries as fixed Vector values', () => {
    const { body, decoder, totalBytes } = decodeBody(VECTOR_BUFFER_DATA_MAP_FIXTURE);

    const map = body.VectorBufferData as Record<string, unknown>;
    expect(map).toBeDefined();
    expect((map as unknown as { [ENTITY]?: string })[ENTITY]).toBe('map');
    for (const [k, expected] of Object.entries(EXPECTED_VECTOR_BUFFER_DATA)) {
      const entry = map[k] as Record<string, unknown>;
      expect(entry).toBeDefined();
      expect((entry as unknown as { [ENTITY]?: string })[ENTITY]).toBe('struct');
      expect(entry.x).toBeCloseTo(expected.x, 5);
      expect(entry.y).toBeCloseTo(expected.y, 5);
      expect(entry.z).toBeCloseTo(expected.z, 5);
    }

    expect(decoder.canStep).toBe(false);
    expect(decoder.position).toBe(totalBytes);
  });

  it('emits tagHeader(mapKey) -> openStruct -> inner reads -> propNone per entry for Map<Name, Struct>', () => {
    const header = loadHeaderThroughSaveClass();
    const buffer = new Uint8Array(header.length + MAP_NAME_STRUCT_FIXTURE.length);
    buffer.set(header, 0);
    buffer.set(MAP_NAME_STRUCT_FIXTURE, header.length);

    const decoder = new StreamDecoder(new BinaryReader(buffer));
    const assembler = new StreamAssembler(decoder);

    const steps: DecodeStepRow[] = [];
    while (decoder.canStep) {
      const s = assembler.step();
      if (s) steps.push(s);
    }

    const openMapIdx = steps.findIndex(
      (s) => s.kind === 'openMap' && s.name === 'MyMap',
    );
    expect(openMapIdx).toBeGreaterThan(-1);

    const expectedKeys = Object.keys(EXPECTED_MAP_NAME_STRUCT);
    let scan = openMapIdx + 1;
    for (const expectedKey of expectedKeys) {
      const keyRow = steps[scan++];
      expect(keyRow.kind).toBe('tagHeader');
      if (keyRow.kind === 'tagHeader') {
        expect(keyRow.field).toBe('mapKey');
        expect(keyRow.value).toBe(expectedKey);
      }
      const openStruct = steps[scan++];
      expect(openStruct).toEqual({ kind: 'openStruct', name: expectedKey });
      let propNoneIdx = -1;
      for (let j = scan; j < steps.length; j++) {
        if (steps[j].kind === 'propNone') {
          propNoneIdx = j;
          break;
        }
        // Sanity: no openMap/openStruct should appear inside a {HP:Float}
        // entry before its PropNone.
        const k = steps[j].kind;
        expect(k === 'openMap' || k === 'openStruct').toBe(false);
      }
      expect(propNoneIdx).toBeGreaterThan(-1);
      scan = propNoneIdx + 1;
    }

    const closeRow = steps[scan];
    expect(closeRow?.kind).toBe('close');
  });

  it('decodes a SetProperty<NameProperty> with padding, count, and items', () => {
    const { body, decoder, totalBytes } = decodeBody(SET_NAME_FIXTURE);
    expect(body.ItemOtaineSet).toEqual([...EXPECTED_ITEM_OTAINE_SET]);
    expect(decoder.position).toBe(totalBytes);
  });
});
