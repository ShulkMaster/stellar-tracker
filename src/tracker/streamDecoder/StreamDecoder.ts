import type * as P from 'types/safeFile';
import { ProType } from 'types/safeFile';
import { BinaryReader } from '../binaryReader/BinaryReader';

export class StreamDecoder {
  private readonly _reader: BinaryReader;

  constructor(reader: BinaryReader) {
    this._reader = reader;
  }

  public decode(): P.StelarSaveFile {
    const header = this.decodeHeader();
    const body: P.SaveBody = {};

    try {

    while (this._reader.position < this._reader.size) {
      const prop = this.decodeProperty();
      if (prop.name === ProType.None) break;
      body[prop.name] = prop;
    }
    } catch (e) {
      console.error(e);
    }

    return { header, body };
  }

  private decodeHeader(): P.SaveHeader {
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

  private decodeProperty(depth: number = 0): P.PropertyTag {
    const startPos = this._reader.position;
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

    if (depth === 0) {
      console.log(`[Parser] Top-Level Prop: ${propName} (${propType}) at ${startPos}, size: ${byteSize}`);
    }

    const ctx: P.PropertyParseContext = {
      propName,
      propType,
      byteSize,
      arrayIndex,
    };

    return this.castValue(ctx);
  }

  private castValue(context: P.PropertyParseContext, isCollectionItem: boolean = false): P.PropertyTag {
    switch (context.propType) {
      case ProType.Int64Property: {
        return this.asInt64Prop(context, isCollectionItem);
      }
      case 'UInt64Property': {
        return this.asInt64Prop(context, isCollectionItem);
      }
      case ProType.IntProperty: {
        return this.asIntProp(context, isCollectionItem);
      }
      case 'Int16Property': {
        return this.asInt16Prop(context, isCollectionItem);
      }
      case 'Int8Property': {
        return this.asInt8Prop(context, isCollectionItem);
      }
      case 'UInt32Property': {
        return this.asIntProp(context, isCollectionItem);
      }
      case 'UInt16Property': {
        return this.asUint16Prop(context, isCollectionItem);
      }
      case ProType.FloatProperty: {
        return this.asFloatProp(context, isCollectionItem);
      }
      case 'DoubleProperty': {
        return this.asDoubleProp(context, isCollectionItem);
      }
      case ProType.BoolProperty: {
        return this.asBoolProp(context, isCollectionItem);
      }
      case ProType.ByteProperty: {
        return this.asByteProp(context, isCollectionItem);
      }
      case 'EnumProperty': {
        return this.asEnumProp(context, isCollectionItem);
      }
      case ProType.StrProperty: {
        return this.asStrProp(context, isCollectionItem);
      }
      case ProType.MapProperty: {
        return this.asMapProp(context);
      }
      case ProType.ArrayProperty: {
        return this.asArrayProp(context);
      }
      case 'SetProperty': {
        return this.asSetProp(context);
      }
      case ProType.NameProperty: {
        if (!isCollectionItem) {
          this._reader.readByte(); // separator
        }
        return this.asNameProp(context, this._reader.readString());
      }
      case ProType.StructProperty: {
        return this.asStructProp(context, isCollectionItem);
      }
      case 'Name': {
        return this.asNameProp(context, this._reader.readString());
      }
      default: {
        if (!isCollectionItem && context.byteSize > 0) {
          this._reader.readByte(); // separator
          this._reader.seek(this._reader.position + context.byteSize);
          return {
            name: context.propName,
            type: context.propType as any,
            value: `Blob(${context.byteSize})`,
          };
        }
        throw new Error(`Unsupported type: ${context.propType} at ${this._reader.position}`);
      }
    }
  }

  private asInt64Prop(context: P.PropertyParseContext, isCollectionItem: boolean): P.Int64Prop {
    let guid: string | undefined = undefined;
    if (!isCollectionItem) {
      const hasTag = this._reader.readByte();
      if (hasTag) {
        guid = this._reader.readGUID();
      }
    }

    const value = this._reader.readInt64();

    return {
      name: context.propName,
      type: ProType.Int64Property,
      guid,
      value,
    };
  }

  private asIntProp(context: P.PropertyParseContext, isCollectionItem: boolean): P.IntProp {
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    const value = this._reader.readInt32();
    return {
      name: context.propName,
      type: ProType.IntProperty,
      value,
    };
  }

  private asInt16Prop(context: P.PropertyParseContext, isCollectionItem: boolean): any {
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    const value = this._reader.readInt16();
    return {
      name: context.propName,
      type: 'Int16Property',
      value,
    };
  }

  private asInt8Prop(context: P.PropertyParseContext, isCollectionItem: boolean): any {
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    const value = this._reader.readInt8();
    return {
      name: context.propName,
      type: 'Int8Property',
      value,
    };
  }

  private asUint16Prop(context: P.PropertyParseContext, isCollectionItem: boolean): any {
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    const value = this._reader.readUint16();
    return {
      name: context.propName,
      type: 'UInt16Property',
      value,
    };
  }

  private asFloatProp(context: P.PropertyParseContext, isCollectionItem: boolean): P.FloatProp {
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    const value = this._reader.readFloat32();
    return {
      name: context.propName,
      type: ProType.FloatProperty,
      value,
    };
  }

  private asDoubleProp(context: P.PropertyParseContext, isCollectionItem: boolean): any {
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    const value = this._reader.readFloat64();
    return {
      name: context.propName,
      type: 'DoubleProperty',
      value,
    };
  }

  private asBoolProp(context: P.PropertyParseContext, isCollectionItem: boolean): P.BoolProp {
    const value = this._reader.readByte() !== 0;
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    return {
      name: context.propName,
      type: ProType.BoolProperty,
      value,
    };
  }

  private asByteProp(context: P.PropertyParseContext, isCollectionItem: boolean): P.ByteProp {
    let enumName = 'None';
    if (!isCollectionItem) {
      enumName = this._reader.readString();
      this._reader.readByte(); // separator
    }

    let value: string | number;
    // In collections (Map keys/values), ByteProperty enums are stored as strings (Names)
    if (isCollectionItem || enumName !== 'None') {
      try {
        value = this._reader.readString();
      } catch (e) {
        // Fallback for raw byte if string read fails (though unlikely to be caught here)
        if (isCollectionItem) {
           value = this._reader.readByte();
        } else {
           throw e;
        }
      }
    } else {
      value = this._reader.readByte();
    }

    return {
      name: context.propName,
      type: ProType.ByteProperty,
      enumName,
      value,
    };
  }

  private asEnumProp(context: P.PropertyParseContext, isCollectionItem: boolean): any {
    let enumName = 'None';
    if (!isCollectionItem) {
      enumName = this._reader.readString();
      this._reader.readByte(); // separator
    }

    const value = this._reader.readString();

    return {
      name: context.propName,
      type: 'EnumProperty',
      enumName,
      value,
    };
  }

  private asStrProp(context: P.PropertyParseContext, isCollectionItem: boolean): P.StrProp {
    if (!isCollectionItem) {
      this._reader.readByte(); // separator
    }
    const value = this._reader.readString();
    return {
      name: context.propName,
      type: ProType.StrProperty,
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

  private asStructProp(context: P.PropertyParseContext, isCollectionItem: boolean, structType: string = 'Unknown'): P.StructProp {
    if (!isCollectionItem) {
      structType = this._reader.readString();
      this._reader.readGUID();
      const hasTag = this._reader.readByte();
      if (hasTag) {
        this._reader.readGUID();
      }
    }
    console.log(`[Struct] ${context.propName} (${structType}) at ${this._reader.position}`);

    if (structType === 'DateTime' || structType === 'Timespan') {
       return {
         name: context.propName,
         type: ProType.StructProperty,
         value: this._reader.readInt64(),
       }
    }

    if (structType === 'Vector' || structType === 'Rotator' || (isCollectionItem && context.propName.includes('Vector') && structType === 'Unknown')) {
        return {
            name: context.propName,
            type: ProType.StructProperty,
            value: {
                x: this._reader.readFloat32(),
                y: this._reader.readFloat32(),
                z: this._reader.readFloat32(),
            }
        }
    }

    if (structType === 'Vector2D') {
        return {
            name: context.propName,
            type: ProType.StructProperty,
            value: {
                x: this._reader.readFloat32(),
                y: this._reader.readFloat32(),
            }
        }
    }

    if (structType === 'LinearColor' || structType === 'Quat') {
        return {
            name: context.propName,
            type: ProType.StructProperty,
            value: {
                r: this._reader.readFloat32(),
                g: this._reader.readFloat32(),
                b: this._reader.readFloat32(),
                a: this._reader.readFloat32(),
            }
        }
    }

    if (structType === 'Guid') {
        return {
            name: context.propName,
            type: ProType.StructProperty,
            value: this._reader.readGUID(),
        }
    }

    const value: Record<string, P.PropertyTag> = {};
    while (true) {
      const prop = this.decodeProperty(isCollectionItem ? 2 : 1);
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
    console.log(`[Map] ${context.propName}: ${keyPropType} -> ${valuePropType}`);
    
    // Skip 5 bytes (1 separator + 4 unknown, often 0)
    this._reader.seek(this._reader.position + 5);
    const entries = this._reader.readInt32();

    const value: Record<string, P.PropertyTag> = {};

    for (let i = 0; i < entries; i++) {
      const keyProp = this.decodeValue(keyPropType, 'Key', context.propName);
      const valProp = this.decodeValue(valuePropType, 'Value', context.propName);

      const key = keyProp.value;
      if (typeof key === 'string') {
        value[key] = valProp;
      } else {
        value[`key_${i}`] = valProp;
      }
    }

    return {
      name: context.propName,
      type: ProType.MapProperty,
      entries,
      value,
    };
  }

  private asArrayProp(context: P.PropertyParseContext): P.ArrayProp {
    const itemType = this._reader.readString();
    this._reader.readByte(); // separator
    const entries = this._reader.readInt32();

    const value: any[] = [];
    if (itemType === ProType.StructProperty && entries > 0) {
        const innerName = this._reader.readString();
        const innerType = this._reader.readString();
        const innerSize = this._reader.readInt32();
        const innerIndex = this._reader.readInt32();
        const innerStructType = this._reader.readString();
        this._reader.readGUID();
        const hasTag = this._reader.readByte();
        if (hasTag) {
            this._reader.readGUID();
        }

        for (let i = 0; i < entries; i++) {
            const innerCtx: P.PropertyParseContext = {
                propName: innerName,
                propType: innerType,
                byteSize: innerSize,
                arrayIndex: innerIndex,
            };
            value.push(this.asStructProp(innerCtx, true, innerStructType));
        }
    } else {
        for (let i = 0; i < entries; i++) {
            value.push(this.decodeValue(itemType, `${context.propName}_${i}`));
        }
    }

    return {
      name: context.propName,
      type: ProType.ArrayProperty,
      itemType,
      value,
    };
  }

  private asSetProp(context: P.PropertyParseContext): any {
    const itemType = this._reader.readString();
    // SetProperty has 5 bytes after type (1 separator + 4 zeros)
    this._reader.seek(this._reader.position + 5);
    const entries = this._reader.readInt32();

    const value: any[] = [];
    for (let i = 0; i < entries; i++) {
        value.push(this.decodeValue(itemType, `${context.propName}_${i}`));
    }

    return {
      name: context.propName,
      type: 'SetProperty',
      itemType,
      value,
    };
  }

  private decodeValue(type: string, name: string, parentName: string = ''): P.PropertyTag {
    const context: P.PropertyParseContext = {
      propName: name === 'Value' && parentName ? parentName : name,
      propType: type,
      byteSize: 0,
      arrayIndex: 0,
    };

    return this.castValue(context, true);
  }
}
