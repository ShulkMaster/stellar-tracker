import type { SaveHeader } from 'types/safeFile';
import { BinaryReader } from '../binaryReader/BinaryReader';

export class StreamDecoder {
  private readonly _reader: BinaryReader;
  // private readonly _stack: unknown[] = [];

  constructor(reader: BinaryReader) {
    this._reader = reader;
  }

  decodeHeader(): SaveHeader {
    const stelarHeader = this._reader.readASCII(4);
    const stelarVersion = this._reader.readInt32();
    const unrealHeader = this._reader.readASCII(4);
    const unrealVersion = this._reader.readInt32();
    const packageVersion = this._reader.readInt32();
    const majorVersion = this._reader.readUint16();
    const minorVersion = this._reader.readUint16();
    const patchVersion = this._reader.readUint16();
    const changelistVersion = this._reader.readInt32();
    const engineBranch = this._reader.readString();
    const customVersionFormat = this._reader.readInt32();
    const customVersionCount = this._reader.readInt32();

    const customVersions = [];
    for (let i = 0; i < customVersionCount; i++) {
      customVersions.push({
        guid: this._reader.readGUID(),
        version: this._reader.readInt32(),
      });
    }

    const saveClassName = this._reader.readString();

    return {
      stelarHeader,
      stelarVersion,
      unrealHeader,
      unrealVersion,
      packageVersion,
      majorVersion,
      minorVersion,
      patchVersion,
      changelistVersion,
      engineBranch,
      customVersionFormat,
      customVersionCount,
      customVersions,
      saveClassName,
    }
  }
}
