import { BinaryWriter } from 'parser/binaryWriter/BinaryWriter';

/**
 * Expected Int64 value of `NewGameCreateTime` (matches SBS00.sav bytes
 * `50 FB E9 FA AE 66 DE 08` decoded little-endian).
 */
export const EXPECTED_NEW_GAME_CREATE_TIME = 0x08de66aefae9fb50n;

/**
 * SBS00.sav bytes 0x4B7–0x4EF: the first property tag of the body — a
 * primitive `Int64Property` named `NewGameCreateTime` with no PropertyGuid —
 * followed by a synthetic `None` terminator so a parser fed only this slice
 * can stop cleanly without reading past EOF.
 *
 * Layout (66 bytes total, 57 of which are the property tag itself):
 *   name FString "NewGameCreateTime"  (4 + 18 bytes)
 *   type FString "Int64Property"      (4 + 14 bytes)
 *   size Int32 8                      (4 bytes)
 *   arrayIndex Int32 0                (4 bytes)
 *   hasPropertyGuid Byte 0            (1 byte)
 *   value Int64 LE                    (8 bytes)
 *   name FString "None"               (4 + 5 bytes) — synthetic terminator
 */
function buildFirstBodyProperty(): Uint8Array {
  const w = new BinaryWriter();
  w.writeString('NewGameCreateTime');
  w.writeString('Int64Property');
  w.writeInt32(8);
  w.writeInt32(0);
  w.writeByte(0);
  w.writeInt64(EXPECTED_NEW_GAME_CREATE_TIME);
  w.writeString('None');
  return w.toUint8Array();
}

export const FIRST_BODY_PROPERTY = buildFirstBodyProperty();

export const FIRST_BODY_PROPERTY_BYTES = 66;
export const FIRST_BODY_PROPERTY_TAG_BYTES = 57;
