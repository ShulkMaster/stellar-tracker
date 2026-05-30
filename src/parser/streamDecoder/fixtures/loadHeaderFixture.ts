import { BinaryWriter } from 'parser/binaryWriter/BinaryWriter';
import { EXPECTED_CUSTOM_VERSIONS } from './customVersionsExpected';
import { HEADER_THROUGH_SAVE_CLASS } from './headerFixture';

function buildFirstCustomVersion(): Uint8Array {
  const entry = EXPECTED_CUSTOM_VERSIONS[0];
  const w = new BinaryWriter();
  w.writeGUID(entry.guid);
  w.writeInt32(entry.version);
  return w.toUint8Array();
}

const FIRST_CUSTOM_VERSION = buildFirstCustomVersion();

/** Mirror of SBS00.sav 0x00–0x4B6: full GVAS header through saveClassName. */
export function loadHeaderThroughSaveClass(): Uint8Array {
  return HEADER_THROUGH_SAVE_CLASS.slice();
}

/** Mirror of SBS00.sav 0x3D–0x50: first custom version entry (GUID + Int32). */
export function loadFirstCustomVersion(): Uint8Array {
  return FIRST_CUSTOM_VERSION.slice();
}
