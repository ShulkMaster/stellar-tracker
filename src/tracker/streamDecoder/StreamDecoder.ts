import type * as P from 'types/safeFile';
import { ProType } from 'types/safeFile';
import { BinaryReader } from '../binaryReader/BinaryReader';

function hasGuid(prop: string): boolean {
  switch (prop) {
    case ProType.Int64Property:
      return true;
      // other cases coming up
  }

  return false;
}

export class StreamDecoder {
  private readonly _reader: BinaryReader;
  private readonly _ctx: P.PropertyParseContext = {
    propName: '',
    propType: '',
    byteSize: 0,
    arrayIndex: 0,
    guidTag: undefined,
  };

  constructor(reader: BinaryReader) {
    this._reader = reader;
  }

  decodeHeader(): P.SaveHeader {
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

  public decodeProperty(): P.PropertyTag {
    const propName = this._reader.readString();
    const propType = this._reader.readString();

    const byteSize = this._reader.readInt32();
    const arrayIndex = this._reader.readInt32();
    let guidTag: string | undefined = undefined;

    if (hasGuid(propType)) {
      const hasTag = this._reader.readByte();
      if (hasTag) {
        // guidTag =
        throw Error('Not implemented GUID parsing');
      }
    }

    this._ctx.propName = propName;
    this._ctx.propType = propType;
    this._ctx.byteSize = byteSize;
    this._ctx.arrayIndex = arrayIndex;
    this._ctx.guidTag = guidTag;

    return this.castValue(this._ctx);
  }

  private castValue(context: P.PropertyParseContext): P.PropertyTag {
    switch (context.propType) {
      case ProType.Int64Property: {
        return this.asInt64Prop(context, this._reader.readInt64());
      }
      case ProType.MapProperty: {
        return this.asMapProp(context);
      }
    }

    throw new Error(`Unsupported type: ${context.propType}`);
  }

  private asInt64Prop(context: P.PropertyParseContext, value: bigint): P.Int64Prop {
    return {
      name: context.propName,
      type: ProType.Int64Property,
      value,
    };
  }

  private asMapProp(context: P.PropertyParseContext): P.MapProp {
    const keyPropName = this._reader.readString();
    const keyPropType = this._reader.readString();

    return {
      name: context.propName,
      type: ProType.MapProperty,
      value: {},
    };
  }
}
