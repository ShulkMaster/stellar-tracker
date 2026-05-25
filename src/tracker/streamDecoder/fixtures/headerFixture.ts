import { BinaryWriter } from 'tracker/binaryWriter/BinaryWriter';
import {
  EXPECTED_CUSTOM_VERSIONS,
  CUSTOM_VERSION_ENTRY_BYTES,
} from './customVersionsExpected';

const SAVE_CLASS_NAME = '/Script/SB.SBSaveGame';

export const CUSTOM_VERSION_COUNT = EXPECTED_CUSTOM_VERSIONS.length;

/**
 * Mirror of SBS00.sav 0x00–0x3C: GVAS header through `customVersionCount`.
 * Layout per `gvas-format.mdc`. The trailing `customVersionCount` is whatever
 * `EXPECTED_CUSTOM_VERSIONS.length` is, so this stays consistent with the
 * trimmed test fixture.
 */
function writeHeaderPrefix(w: BinaryWriter, customVersionCount: number): void {
  w.writeASCII('EVAS');
  w.writeInt32(1);
  w.writeASCII('GVAS');
  w.writeInt32(2);
  w.writeInt32(525);
  w.writeUint16(4);
  w.writeUint16(26);
  w.writeUint16(2);
  w.writeUint32(0);
  w.writeString('++UE4+Release-4.26');
  w.writeInt32(3);
  w.writeInt32(customVersionCount);
}

function buildHeaderPrefix(): Uint8Array {
  const w = new BinaryWriter();
  writeHeaderPrefix(w, CUSTOM_VERSION_COUNT);
  return w.toUint8Array();
}

/**
 * Mirror of SBS00.sav 0x00–0x4B6: full GVAS header through `saveClassName`.
 * Built from `EXPECTED_CUSTOM_VERSIONS`, so the fixture stays in sync with
 * whatever count the trimmed list declares.
 */
function buildHeaderThroughSaveClass(): Uint8Array {
  const w = new BinaryWriter(256);
  writeHeaderPrefix(w, CUSTOM_VERSION_COUNT);
  for (const entry of EXPECTED_CUSTOM_VERSIONS) {
    w.writeGUID(entry.guid);
    w.writeInt32(entry.version);
  }
  w.writeString(SAVE_CLASS_NAME);
  return w.toUint8Array();
}

export const HEADER_PREFIX = buildHeaderPrefix();
export const HEADER_PREFIX_BYTES = HEADER_PREFIX.byteLength;

export const HEADER_THROUGH_SAVE_CLASS = buildHeaderThroughSaveClass();
export const HEADER_THROUGH_SAVE_CLASS_BYTES = HEADER_THROUGH_SAVE_CLASS.byteLength;

export const EXPECTED_HEADER = {
  stelarHeader: 'EVAS',
  stelarVersion: 1,
  unrealHeader: 'GVAS',
  unrealVersion: 2,
  packageVersion: 525,
  majorVersion: 4,
  minorVersion: 26,
  patchVersion: 2,
  changelistVersion: 0,
  engineBranch: '++UE4+Release-4.26',
  customVersionFormat: 3,
  customVersionCount: CUSTOM_VERSION_COUNT,
  customVersions: EXPECTED_CUSTOM_VERSIONS,
  saveClassName: SAVE_CLASS_NAME,
};

export { CUSTOM_VERSION_ENTRY_BYTES };
