import { BinaryWriter } from 'tracker/binaryWriter/BinaryWriter';

/**
 * Synthetic body fixtures for `ArrayProperty` decoding (Phase 2).
 *
 * Each fixture mirrors the GVAS body wire format the parser expects after the
 * EVAS+GVAS header drains: one tagged property followed by a single `None`
 * FString so a parser fed only this slice stops cleanly. Use by concatenating
 * after `loadHeaderThroughSaveClass()` in tests.
 *
 * Tag layout (per `gvas-format.mdc`):
 *   name FString
 *   type FString "ArrayProperty"
 *   size Int32 (= Value size in bytes = 4 + items)
 *   arrayIndex Int32 (0)
 *   itemType FString
 *   hasPropertyGuid Byte (0)
 *   value <size bytes>:
 *     itemCount Int32
 *     items[itemCount]   (primitive widths implicit; FString for name/str/enum)
 *
 * After the tag a synthetic terminator FString "None" closes the body list.
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

/**
 * `Lockid : UInt32Property[7] = [0, 6, 7, 7, 21, 3, 1]`. Mirrors the slice at
 * `0x4498` of `SBS00.sav` (per `specs.md` §Findings) but built from scratch so
 * tests don't depend on the binary fixture path.
 *
 * Value bytes: `Int32 itemCount=7` + `7 × Uint32` = `4 + 28 = 32` bytes.
 */
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

/**
 * `ItemQuickSlot : NameProperty[6]`. The first item is a non-`None` string;
 * the remaining 5 items are the literal string `'None'`. This is the key
 * regression case that proves the array iterator is driven by `arrayIter` and
 * does not feed FString items into the tag-name `None` short-circuit.
 *
 * Value bytes: `Int32 itemCount=6` + 1× `Recovery_HP_Potion` (23 B) +
 * 5× `None` (9 B each) = `4 + 23 + 45 = 72` bytes.
 */
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

/**
 * `EmptyArr : IntProperty[0]`. Value is a single `Int32 itemCount=0`, so
 * `Tag.Size == 4`. Exercises the zero-count short-circuit:
 * `OpenArray + Close + TagName` with no element opcodes enqueued and no
 * `arrayIter` frame pushed.
 */
function buildEmptyArrayFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendArrayTagHeader(w, 'EmptyArr', 'IntProperty', 4);
  w.writeInt32(0);
  w.writeString('None');
  return w.toUint8Array();
}

/**
 * `StructArr : StructProperty[2]` — out-of-scope item type for Phase 2. The
 * parser must NOT attempt to decode the items; it should open a placeholder
 * array, skip the remaining Value bytes, close, and resume the parent list.
 *
 * The Value is `Int32 itemCount=2` followed by an arbitrary 80-byte payload
 * (where a real save would carry an `InnerTag` + two struct bodies). The
 * fixture only cares that the reader advances by `Tag.Size` exactly. The
 * payload bytes are zeros for determinism.
 */
const STRUCT_ARR_PAYLOAD_SIZE = 80;
const STRUCT_ARR_VALUE_SIZE = 4 + STRUCT_ARR_PAYLOAD_SIZE;

function buildStructArrayFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendArrayTagHeader(w, 'StructArr', 'StructProperty', STRUCT_ARR_VALUE_SIZE);
  w.writeInt32(2);
  w.padZeros(STRUCT_ARR_PAYLOAD_SIZE);
  w.writeString('None');
  return w.toUint8Array();
}

export const PRIMITIVE_ARRAY_FIXTURE = buildPrimitiveArrayFixture();
export const NAME_ARRAY_FIXTURE = buildNameArrayFixture();
export const EMPTY_ARRAY_FIXTURE = buildEmptyArrayFixture();
export const STRUCT_ARRAY_FIXTURE = buildStructArrayFixture();
export const STRUCT_ARRAY_PAYLOAD_BYTES = STRUCT_ARR_PAYLOAD_SIZE;
