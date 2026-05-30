import { BinaryReader } from 'tracker/binaryReader/BinaryReader';
import type { SharedStructArrayDescriptor } from './ParseFrames';

export function readSharedStructArrayDescriptor(
  reader: BinaryReader,
  expectedValueEnd: number,
): SharedStructArrayDescriptor {
  const start = reader.position;
  const name = reader.readString();
  const type = reader.readString();
  if (type !== 'StructProperty') {
    throw new Error(
      `Expected shared StructProperty array descriptor, got ${type} at offset 0x${start.toString(16)}`,
    );
  }

  const size = reader.readInt32();
  reader.readInt32();
  const structType = reader.readString();
  reader.readGUID();
  const guidFlag = reader.readByte();
  if (guidFlag === 1) {
    reader.readGUID();
  }

  const valueEnd = reader.position + size;
  if (valueEnd !== expectedValueEnd) {
    throw new Error(
      `Struct array descriptor payload ends at 0x${valueEnd.toString(16)}`
      + ` but array value ends at 0x${expectedValueEnd.toString(16)}`,
    );
  }

  return { name, structType, valueEnd };
}

export function readMapStructKeyHeader(reader: BinaryReader, offset: number): string {
  const keyName = reader.readString();
  const keyPropType = reader.readString();
  if (keyPropType !== 'StructProperty') {
    throw new Error(
      `Expected StructProperty map key, got ${keyPropType} at offset 0x${offset.toString(16)}`,
    );
  }
  reader.readInt32();
  reader.readInt32();
  reader.readString();
  reader.readGUID();
  const guidFlag = reader.readByte();
  if (guidFlag === 1) {
    reader.readGUID();
  }
  return keyName;
}

export function readMapKey(
  reader: BinaryReader,
  keyType: string,
  offset: number,
): string {
  switch (keyType) {
    case 'NameProperty':
    case 'StrProperty':
      return reader.readString();
    case 'ByteProperty':
      return reader.readString();
    case 'IntProperty':
    case 'UInt32Property':
      return String(reader.readInt32());
    case 'Int64Property':
      return String(reader.readInt64());
    case 'Int8Property':
      return String(reader.readInt8());
    default:
      throw new Error(
        `Unsupported MapProperty KeyType: ${keyType} (offset 0x${offset.toString(16)})`,
      );
  }
}
