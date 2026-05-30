import { BinaryWriter } from 'tracker/binaryWriter/BinaryWriter';

/**
 * `ItemOtaineSet : SetProperty<NameProperty>` with two FString items.
 * Mirrors layout at `0x5df758` in `public/SBS00.sav` (simplified).
 */
export const EXPECTED_ITEM_OTAINE_SET = ['BS_Raven', 'BS_Eve'] as const;

function buildSetFixture(): Uint8Array {
  const w = new BinaryWriter();
  const inner = new BinaryWriter();
  inner.writeInt32(0);
  inner.writeInt32(EXPECTED_ITEM_OTAINE_SET.length);
  for (const s of EXPECTED_ITEM_OTAINE_SET) {
    inner.writeString(s);
  }
  const innerBytes = inner.toUint8Array();

  w.writeString('ItemOtaineSet');
  w.writeString('SetProperty');
  w.writeInt32(innerBytes.length);
  w.writeInt32(0);
  w.writeString('NameProperty');
  w.writeByte(0);
  w.writeSlice(innerBytes);
  w.writeString('None');
  return w.toUint8Array();
}

export const SET_NAME_FIXTURE = buildSetFixture();
