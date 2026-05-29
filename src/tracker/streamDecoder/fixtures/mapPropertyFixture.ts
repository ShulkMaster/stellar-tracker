import { BinaryWriter } from 'tracker/binaryWriter/BinaryWriter';

/**
 * Synthetic body fixtures for `MapProperty` decoding (Phase 3).
 *
 * Each fixture mirrors the GVAS body wire format the parser expects after
 * the EVAS+GVAS header drains: one tagged `MapProperty` followed by a
 * single `None` FString so a parser fed only this slice stops cleanly.
 * Use by concatenating after `loadHeaderThroughSaveClass()` in tests.
 *
 * Tag layout (per `gvas-format.mdc` §2):
 *   name FString
 *   type FString "MapProperty"
 *   size Int32 (= Value size in bytes = 4 + 4 + entries-payload)
 *   arrayIndex Int32 (0)
 *   keyType FString
 *   valueType FString
 *   hasPropertyGuid Byte (0)
 *   value <size bytes>:
 *     unused/padding Int32 (= 0)
 *     entryCount Int32
 *     entries[entryCount] = (key, value) pairs
 *
 * After the tag a synthetic terminator FString "None" closes the body
 * list.
 *
 * The struct-valued entries are built explicitly: each entry's value is
 * itself a property list ending in a `None` FString. No per-entry
 * InnerTag header (unlike `ArrayProperty<StructProperty>`).
 */

export const EXPECTED_MAP_NAME_FLOAT: Readonly<Record<string, number>> = {
  PlayerCameraPitch: 12.5,
  PlayerCameraYaw: -30.25,
};

// Map<Name, Struct{ HP: Float }> — two entries.
export type ExpectedMapNameStructEntry = { HP: number };
export const EXPECTED_MAP_NAME_STRUCT: Readonly<
  Record<string, ExpectedMapNameStructEntry>
> = {
  Alpha: { HP: 100 },
  Bravo: { HP: 42.5 },
};

export const EXPECTED_MAP_INT_INT_EMPTY: Readonly<Record<string, number>> = {};

// Map<Int, Struct{ HP: Float }> — two entries; keys are stringified ints.
export const EXPECTED_MAP_INT_STRUCT: Readonly<
  Record<string, ExpectedMapNameStructEntry>
> = {
  '5': { HP: 1.5 },
  '7': { HP: 9.25 },
};

function fstringByteLength(text: string): number {
  if (text.length === 0) return 4;
  return 4 + text.length + 1;
}

function appendMapTagHeader(
  w: BinaryWriter,
  name: string,
  keyType: string,
  valueType: string,
  size: number,
): void {
  w.writeString(name);
  w.writeString('MapProperty');
  w.writeInt32(size);
  w.writeInt32(0);
  w.writeString(keyType);
  w.writeString(valueType);
  w.writeByte(0);
}

/**
 * Build the inner property list for a `Struct { HP: FloatProperty }`
 * value. Mirrors the property-tag layout (no per-entry InnerTag wrapper).
 *
 * Property tag bytes:
 *   Name FString "HP"               4 + 3 = 7
 *   Type FString "FloatProperty"    4 + 14 = 18
 *   Size Int32 = 4                  4
 *   ArrayIndex Int32 = 0            4
 *   HasPropertyGuid Byte = 0        1
 *   Value Float32                   4
 *   None terminator FString         4 + 5 = 9
 *  --------------------------------
 *  total                            51 bytes
 */
function buildHpStructValue(hp: number): Uint8Array {
  const inner = new BinaryWriter();
  inner.writeString('HP');
  inner.writeString('FloatProperty');
  inner.writeInt32(4);
  inner.writeInt32(0);
  inner.writeByte(0);
  inner.writeFloat32(hp);
  inner.writeString('None');
  return inner.toUint8Array();
}

/**
 * F1 — `DataMap_float : Map<NameProperty, FloatProperty>` with 2 entries.
 * Exercises the primitive-value boundary in `advancePropertyIter`
 * (FieldFloat32 in `_arrayElementOpcodes`).
 *
 * Per-entry: NameFString key + 4-byte Float32 value.
 */
function buildNameFloatMap(): Uint8Array {
  const entries = Object.entries(EXPECTED_MAP_NAME_FLOAT);
  let entryBytes = 0;
  for (const [k] of entries) entryBytes += fstringByteLength(k) + 4;
  const valueSize = 4 + 4 + entryBytes;

  const w = new BinaryWriter();
  appendMapTagHeader(w, 'DataMap_float', 'NameProperty', 'FloatProperty', valueSize);
  w.writeInt32(0);
  w.writeInt32(entries.length);
  for (const [k, v] of entries) {
    w.writeString(k);
    w.writeFloat32(v);
  }
  w.writeString('None');
  return w.toUint8Array();
}

/**
 * F2 — `MyMap : Map<NameProperty, StructProperty>` with 2 struct entries.
 * Exercises the struct-value boundary (`PropNone` + depth match) and the
 * `handleTagName` None gate that prevents the post-entry None from being
 * misread as a property tag name.
 */
function buildNameStructMap(): Uint8Array {
  const entries = Object.entries(EXPECTED_MAP_NAME_STRUCT);
  let entryBytes = 0;
  const builtValues: Uint8Array[] = [];
  for (const [k, v] of entries) {
    const val = buildHpStructValue(v.HP);
    builtValues.push(val);
    entryBytes += fstringByteLength(k) + val.length;
  }
  const valueSize = 4 + 4 + entryBytes;

  const w = new BinaryWriter();
  appendMapTagHeader(w, 'MyMap', 'NameProperty', 'StructProperty', valueSize);
  w.writeInt32(0);
  w.writeInt32(entries.length);
  for (let i = 0; i < entries.length; i++) {
    w.writeString(entries[i][0]);
    w.writeSlice(builtValues[i]);
  }
  w.writeString('None');
  return w.toUint8Array();
}

/**
 * F3 — `TaskValueMap : Map<IntProperty, IntProperty>` with 0 entries.
 * Exercises the empty-map short-circuit (`OpenMap + Close + TagName`,
 * no frame, no MapEntry opcode).
 *
 * Value bytes: 4 padding + 4 entryCount = 8 bytes.
 */
function buildEmptyIntIntMap(): Uint8Array {
  const w = new BinaryWriter();
  appendMapTagHeader(w, 'TaskValueMap', 'IntProperty', 'IntProperty', 8);
  w.writeInt32(0);
  w.writeInt32(0);
  w.writeString('None');
  return w.toUint8Array();
}

/**
 * F4 — `Equipment : Map<IntProperty, StructProperty>` with 2 entries.
 * Exercises Int-keyed dispatch (stringified to `'5'`, `'7'`) and
 * struct-value boundary.
 *
 * Per-entry: Int32 key + struct-property-list (51 bytes for `{HP: Float}`).
 */
function buildIntStructMap(): Uint8Array {
  const entries = Object.entries(EXPECTED_MAP_INT_STRUCT);
  let entryBytes = 0;
  const builtValues: Uint8Array[] = [];
  for (const [, v] of entries) {
    const val = buildHpStructValue(v.HP);
    builtValues.push(val);
    entryBytes += 4 + val.length;
  }
  const valueSize = 4 + 4 + entryBytes;

  const w = new BinaryWriter();
  appendMapTagHeader(w, 'Equipment', 'IntProperty', 'StructProperty', valueSize);
  w.writeInt32(0);
  w.writeInt32(entries.length);
  for (let i = 0; i < entries.length; i++) {
    w.writeInt32(Number(entries[i][0]));
    w.writeSlice(builtValues[i]);
  }
  w.writeString('None');
  return w.toUint8Array();
}

export const MAP_NAME_FLOAT_FIXTURE = buildNameFloatMap();
export const MAP_NAME_STRUCT_FIXTURE = buildNameStructMap();
export const MAP_INT_INT_EMPTY_FIXTURE = buildEmptyIntIntMap();
export const MAP_INT_STRUCT_FIXTURE = buildIntStructMap();
