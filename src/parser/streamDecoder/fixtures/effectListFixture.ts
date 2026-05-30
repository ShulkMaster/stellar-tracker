import { BinaryWriter } from 'parser/binaryWriter/BinaryWriter';

const STRUCT_GUID_ZERO = '00000000000000000000000000000000';

/**
 * `EffectList : ArrayProperty<StructProperty>` (empty).
 * Built with BinaryWriter (no external .bin). Matches the wire layout from
 * public/SBS00.sav at the EffectList property (itemCount=0, valueSize=0).
 */
function buildEffectListFixture(): Uint8Array {
  const w = new BinaryWriter();

  // Outer ArrayProperty<StructProperty> tag header
  w.writeString('EffectList');
  w.writeString('ArrayProperty');
  const sizePos = w.position;
  w.writeInt32(0); // placeholder for payload size (count + shared desc)
  w.writeInt32(0); // arrayIndex
  w.writeString('StructProperty');
  w.writeByte(0); // hasGuid=0

  const payloadStart = w.position;

  // itemCount=0
  w.writeInt32(0);

  // Shared struct descriptor (for 0 elements, valueSize=0)
  w.writeString('EffectList');
  w.writeString('StructProperty');
  w.writeInt32(0); // valueSize (per-element body size)
  w.writeInt32(0); // arrayIndex
  w.writeString('SBSaveGameData_EffectObject');
  w.writeGUID(STRUCT_GUID_ZERO);
  w.writeByte(0);

  const payloadEnd = w.position;
  const payloadSize = payloadEnd - payloadStart;

  // Backpatch the outer size field
  w.seek(sizePos);
  w.writeInt32(payloadSize);
  w.seek(payloadEnd);

  // Synthetic terminator for the body property list
  w.writeString('None');

  return w.toUint8Array();
}

export const EXPECTED_EFFECT_LIST_COUNT = 0;

export const EFFECT_LIST_FIXTURE = buildEffectListFixture();
