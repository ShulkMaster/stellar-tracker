import { Opcode } from 'tracker/ringBuffer/Opcodes';

const PRIMITIVE_ELEMENT_OPCODES: ReadonlySet<Opcode> = new Set([
  Opcode.FixInt32,
  Opcode.FieldInt64,
  Opcode.FieldFloat32,
  Opcode.FieldDouble64,
  Opcode.FieldByte,
  Opcode.FieldInt8,
  Opcode.FieldString,
]);

const FLOAT_STRUCT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Vector: ['x', 'y', 'z'],
  Rotator: ['pitch', 'yaw', 'roll'],
  Quat: ['x', 'y', 'z', 'w'],
  Vector2D: ['x', 'y'],
  LinearColor: ['r', 'g', 'b', 'a'],
};

const SCALAR_STRUCT_OPCODES: Readonly<Record<string, Opcode>> = {
  Guid: Opcode.FieldGuid,
  DateTime: Opcode.FieldInt64,
};

const MAP_STRUCT_VALUE_TYPES: Readonly<Record<string, string>> = {
  VectorBufferData: 'Vector',
};

export function isPrimitiveElementOpcode(opcode: Opcode): boolean {
  return PRIMITIVE_ELEMENT_OPCODES.has(opcode);
}

export function floatStructFields(structType: string): readonly string[] | undefined {
  return FLOAT_STRUCT_FIELDS[structType];
}

export function scalarStructOpcode(structType: string): Opcode | undefined {
  return SCALAR_STRUCT_OPCODES[structType];
}

export function isGenericStructType(structType: string): boolean {
  return floatStructFields(structType) === undefined
    && scalarStructOpcode(structType) === undefined;
}

export function mapStructValueType(propName: string): string | undefined {
  return MAP_STRUCT_VALUE_TYPES[propName];
}
