import type * as P from 'types/safeFile';
import { ProType } from 'types/safeFile';
import { BinaryReader } from '../binaryReader/BinaryReader';

function hex(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  return [...bytes]
      .map(b => b.toString(16).padStart(2, "0"))
      .join(" ");
}

export class StreamDecoder {
  private readonly _reader: BinaryReader;
  private readonly _ctx: P.PropertyParseContext = {
    propName: '',
    propType: '',
    byteSize: 0,
    arrayIndex: 0,
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

    if (propName === ProType.None) {
      return {
        name: propName,
        type: ProType.None,
        value: undefined,
      } as any;
    }

    const propType = this._reader.readString();
    const byteSize = this._reader.readInt32();
    const arrayIndex = this._reader.readInt32();

    this._ctx.propName = propName;
    this._ctx.propType = propType;
    this._ctx.byteSize = byteSize;
    this._ctx.arrayIndex = arrayIndex;

    return this.castValue(this._ctx);
  }

  private castValue(context: P.PropertyParseContext): P.PropertyTag {
    switch (context.propType) {
      case ProType.Int64Property: {
        return this.asInt64Prop(context);
      }
      case ProType.MapProperty: {
        return this.asMapProp(context);
      }
      case ProType.NameProperty: {
        return this.asNameProp(context, this._reader.readString());
      }
      case ProType.StructProperty: {
        return this.asStructProp(context);
      }
      case 'Name': {
        return this.asNameProp(context, this._reader.readString());
      }
    }

    throw new Error(`Unsupported type: ${context.propType}`);
  }

  private asInt64Prop(context: P.PropertyParseContext): P.Int64Prop {
    const hasTag = this._reader.readByte();
    let guid: string | undefined = undefined;

    if (hasTag) {
      guid = this._reader.readGUID();
    }

    const value = this._reader.readInt64();

    return {
      name: context.propName,
      type: ProType.Int64Property,
      guid,
      value,
    };
  }

  private asNameProp(context: P.PropertyParseContext, value: string): P.NameProp {
    return {
      name: context.propName,
      type: ProType.NameProperty,
      value,
    };
  }

  private asStructProp(context: P.PropertyParseContext): P.StructProp {
    const structType = this._reader.readString();
    const guid = this._reader.readGUID();
    const hasTag = this._reader.readByte();
    if (hasTag) {
      this._reader.readGUID();
    }

    const value: Record<string, P.PropertyTag> = {};
    if (structType === 'DateTime' || structType === 'Timespan') {
       return {
         name: context.propName,
         type: ProType.StructProperty,
         value: this._reader.readInt64(),
       }
    }

    while (true) {
      const prop = this.decodeProperty();
      if (prop.name === ProType.None) break;
      value[prop.name] = prop;
    }

    return {
      name: context.propName,
      type: ProType.StructProperty,
      value,
    };
  }

  private asMapProp(context: P.PropertyParseContext): P.MapProp {
    const keyPropType = this._reader.readString();
    const valuePropType = this._reader.readString();

    const hasGuid = this._reader.readByte();
    if (hasGuid) {
      this._reader.readGUID();
    }

    this._reader.readInt32(); // 4 null bytes?
    const count = this._reader.readInt32();
    const value: Record<string, P.PropertyTag> = {};

    for (let i = 0; i < count; i++) {
      const key = this.decodeValue(keyPropType, 'Key');
      const val = this.decodeValue(valuePropType, 'Value');

      if (typeof key === 'string') {
        value[key] = val;
      } else {
        value[`key_${i}`] = val;
      }
    }

    return {
      name: context.propName,
      type: ProType.MapProperty,
      value,
    };
  }

  private decodeValue(type: string, name: string): any {
    const context: P.PropertyParseContext = {
      propName: name,
      propType: type,
      byteSize: 0,
      arrayIndex: 0,
      guidTag: undefined,
    };

    const prop = this.castValue(context);
    return prop.value;
  }
}
