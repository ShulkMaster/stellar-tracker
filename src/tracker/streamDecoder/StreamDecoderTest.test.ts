import { describe, it, expect } from 'vitest';
import { BinaryReader, StreamDecoder } from 'tracker';
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
} from './fixtures';

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
});
