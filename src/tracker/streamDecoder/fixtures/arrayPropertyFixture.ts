import { BinaryWriter } from 'tracker/binaryWriter/BinaryWriter';

/**
 * Synthetic body fixtures for `ArrayProperty` decoding (Phase 2+).
 *
 * `StructProperty` arrays carry one shared struct descriptor after ItemCount,
 * then count-delimited property-list bodies.
 */

export const EXPECTED_LOCKID_VALUES = [0, 6, 7, 7, 21, 3, 1] as const;
export const EXPECTED_ITEM_QUICK_SLOT_VALUES = [
  'Recovery_HP_Potion',
  'None',
  'None',
  'None',
  'None',
  'None',
] as const;
export const EXPECTED_EMPTY_INT_ARRAY: readonly number[] = [];

export type ExpectedStructArrayEntry = { HP: number };
export const EXPECTED_STRUCT_ARRAY: readonly ExpectedStructArrayEntry[] = [
  { HP: 100 },
  { HP: 42.5 },
];

const STRUCT_GUID_ZERO = '00000000000000000000000000000000';

function appendArrayTagHeader(
  w: BinaryWriter,
  name: string,
  itemType: string,
  size: number,
): void {
  w.writeString(name);
  w.writeString('ArrayProperty');
  w.writeInt32(size);
  w.writeInt32(0);
  w.writeString(itemType);
  w.writeByte(0);
}

function appendSharedStructArrayDescriptor(
  w: BinaryWriter,
  name: string,
  structType: string,
  valueSize: number,
): void {
  w.writeString(name);
  w.writeString('StructProperty');
  w.writeInt32(valueSize);
  w.writeInt32(0);
  w.writeString(structType);
  w.writeGUID(STRUCT_GUID_ZERO);
  w.writeByte(0);
}

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

function buildPrimitiveArrayFixture(): Uint8Array {
  const w = new BinaryWriter();
  const valueSize = 4 + EXPECTED_LOCKID_VALUES.length * 4;
  appendArrayTagHeader(w, 'Lockid', 'UInt32Property', valueSize);
  w.writeInt32(EXPECTED_LOCKID_VALUES.length);
  for (const v of EXPECTED_LOCKID_VALUES) {
    w.writeUint32(v);
  }
  w.writeString('None');
  return w.toUint8Array();
}

function buildNameArrayFixture(): Uint8Array {
  const w = new BinaryWriter();
  const inner = new BinaryWriter();
  inner.writeInt32(EXPECTED_ITEM_QUICK_SLOT_VALUES.length);
  for (const s of EXPECTED_ITEM_QUICK_SLOT_VALUES) {
    inner.writeString(s);
  }
  const innerBytes = inner.toUint8Array();
  appendArrayTagHeader(w, 'ItemQuickSlot', 'NameProperty', innerBytes.length);
  w.writeSlice(innerBytes);
  w.writeString('None');
  return w.toUint8Array();
}

function buildEmptyArrayFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendArrayTagHeader(w, 'EmptyArr', 'IntProperty', 4);
  w.writeInt32(0);
  w.writeString('None');
  return w.toUint8Array();
}

/**
 * `StructArr : StructProperty[2]` — one shared struct descriptor followed by
 * two count-delimited `{ HP: Float }` property-list bodies.
 */
function buildStructArrayFixture(): Uint8Array {
  const values = EXPECTED_STRUCT_ARRAY.map((entry) => buildHpStructValue(entry.HP));
  const valueBytesLength = values.reduce((sum, value) => sum + value.length, 0);
  const payload = new BinaryWriter();
  payload.writeInt32(EXPECTED_STRUCT_ARRAY.length);
  appendSharedStructArrayDescriptor(payload, 'StructArr', 'TestStruct', valueBytesLength);
  for (const value of values) {
    payload.writeSlice(value);
  }
  const payloadBytes = payload.toUint8Array();

  const w = new BinaryWriter();
  appendArrayTagHeader(w, 'StructArr', 'StructProperty', payloadBytes.length);
  w.writeSlice(payloadBytes);
  w.writeString('None');
  return w.toUint8Array();
}

export const PRIMITIVE_ARRAY_FIXTURE = buildPrimitiveArrayFixture();
export const NAME_ARRAY_FIXTURE = buildNameArrayFixture();
export const EMPTY_ARRAY_FIXTURE = buildEmptyArrayFixture();
export const STRUCT_ARRAY_FIXTURE = buildStructArrayFixture();
