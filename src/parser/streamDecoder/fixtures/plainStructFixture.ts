import { BinaryWriter } from 'parser/binaryWriter/BinaryWriter';

/**
 * Synthetic body fixtures for plain `StructProperty` decoding (Phase 1).
 *
 * Each fixture mirrors the GVAS body wire format the parser expects after the
 * EVAS+GVAS header drains: one tagged property followed by a single `None`
 * FString so a parser fed only this slice stops cleanly. Use by concatenating
 * after `loadHeaderThroughSaveClass()` in tests.
 *
 * Tag layout (per `gvas-format.mdc`):
 *   name FString
 *   type FString "StructProperty"
 *   size Int32 (= Value size in bytes)
 *   arrayIndex Int32 (0)
 *   structName FString (Vector / Rotator / Guid / DateTime / generic name)
 *   structGuid 16 zero bytes
 *   hasPropertyGuid Byte (0)
 *   value <size bytes>
 *
 * After the tag a synthetic terminator FString "None" closes the body list.
 */

export const EXPECTED_VECTOR = { x: 1.0, y: 2.0, z: 3.0 } as const;
export const EXPECTED_ROTATOR = { pitch: 10.0, yaw: 20.0, roll: 30.0 } as const;
export const EXPECTED_QUAT = { x: 0.1, y: 0.2, z: 0.3, w: 1.0 } as const;
export const EXPECTED_LINEAR_COLOR = { r: 0.25, g: 0.5, b: 0.75, a: 1.0 } as const;
export const EXPECTED_GUID_HEX = '12345678ABCDEF019876543210FEDCBA';
export const EXPECTED_DATETIME_TICKS = 0x089ABCDEF0123456n;
export const EXPECTED_GENERIC_STRUCT = { Health: 100.0 } as const;

const STRUCT_GUID_ZERO = '00000000000000000000000000000000';

function appendStructTagHeader(
  w: BinaryWriter,
  name: string,
  structName: string,
  size: number,
): void {
  w.writeString(name);
  w.writeString('StructProperty');
  w.writeInt32(size);
  w.writeInt32(0);
  w.writeString(structName);
  w.writeGUID(STRUCT_GUID_ZERO);
  w.writeByte(0);
}

function buildVectorFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendStructTagHeader(w, 'Pos', 'Vector', 12);
  w.writeFloat32(EXPECTED_VECTOR.x);
  w.writeFloat32(EXPECTED_VECTOR.y);
  w.writeFloat32(EXPECTED_VECTOR.z);
  w.writeString('None');
  return w.toUint8Array();
}

function buildRotatorFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendStructTagHeader(w, 'Rot', 'Rotator', 12);
  w.writeFloat32(EXPECTED_ROTATOR.pitch);
  w.writeFloat32(EXPECTED_ROTATOR.yaw);
  w.writeFloat32(EXPECTED_ROTATOR.roll);
  w.writeString('None');
  return w.toUint8Array();
}

function buildQuatFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendStructTagHeader(w, 'Orient', 'Quat', 16);
  w.writeFloat32(EXPECTED_QUAT.x);
  w.writeFloat32(EXPECTED_QUAT.y);
  w.writeFloat32(EXPECTED_QUAT.z);
  w.writeFloat32(EXPECTED_QUAT.w);
  w.writeString('None');
  return w.toUint8Array();
}

function buildLinearColorFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendStructTagHeader(w, 'Tint', 'LinearColor', 16);
  w.writeFloat32(EXPECTED_LINEAR_COLOR.r);
  w.writeFloat32(EXPECTED_LINEAR_COLOR.g);
  w.writeFloat32(EXPECTED_LINEAR_COLOR.b);
  w.writeFloat32(EXPECTED_LINEAR_COLOR.a);
  w.writeString('None');
  return w.toUint8Array();
}

function buildGuidFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendStructTagHeader(w, 'Id', 'Guid', 16);
  w.writeGUID(EXPECTED_GUID_HEX);
  w.writeString('None');
  return w.toUint8Array();
}

function buildDateTimeFixture(): Uint8Array {
  const w = new BinaryWriter();
  appendStructTagHeader(w, 'Created', 'DateTime', 8);
  w.writeInt64(EXPECTED_DATETIME_TICKS);
  w.writeString('None');
  return w.toUint8Array();
}

/**
 * Generic struct: outer `Inner : StructProperty(MyStruct)` whose value is a
 * one-property nested list `{ Health : FloatProperty = 100.0 }` ending in
 * `None`. Tests this fixture's nested-list resumption — the inner `None`
 * decrements `_listDepth` and resumes the body's tag loop, which then reads
 * the trailing body `None`.
 *
 * Inner property-list value layout (51 bytes):
 *   Health name FString  (4 + 7 = 11)
 *   FloatProperty type   (4 + 14 = 18)
 *   size Int32 = 4       (4)
 *   arrayIndex Int32 = 0 (4)
 *   hasPropertyGuid = 0  (1)
 *   value Float32 = 100  (4)
 *   None terminator      (4 + 5 = 9)
 */
function buildGenericStructFixture(): Uint8Array {
  const inner = new BinaryWriter();
  inner.writeString('Health');
  inner.writeString('FloatProperty');
  inner.writeInt32(4);
  inner.writeInt32(0);
  inner.writeByte(0);
  inner.writeFloat32(EXPECTED_GENERIC_STRUCT.Health);
  inner.writeString('None');
  const innerBytes = inner.toUint8Array();

  const w = new BinaryWriter();
  appendStructTagHeader(w, 'Inner', 'MyStruct', innerBytes.length);
  w.writeSlice(innerBytes);
  w.writeString('None');
  return w.toUint8Array();
}

export const VECTOR_STRUCT_FIXTURE = buildVectorFixture();
export const ROTATOR_STRUCT_FIXTURE = buildRotatorFixture();
export const QUAT_STRUCT_FIXTURE = buildQuatFixture();
export const LINEAR_COLOR_STRUCT_FIXTURE = buildLinearColorFixture();
export const GUID_STRUCT_FIXTURE = buildGuidFixture();
export const DATETIME_STRUCT_FIXTURE = buildDateTimeFixture();
export const GENERIC_STRUCT_FIXTURE = buildGenericStructFixture();
