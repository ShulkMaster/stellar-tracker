export const enum Opcode {
  /**
   * FixAscii is a fixed-length ASCII string opcode.
   * the next uint16 is the length of the string.
   */
  FixAscii = 0,
  /**
   * FixInt32 is a fixed-length 32-bit integer.
   * the next uint16 is the number of 32-bit integers to read.
   */
  FixInt32 = 1,
  /**
   * FixUint16 is a fixed-length 16-bit unsigned integer.
   * the next uint16 is the number of 16-bit integers to read.
   */
  FixUint16 = 2,
  /**
   * FieldString reads an Unreal FString from the file.
   */
  FieldString = 3,
  /** Announces the property name for the next read step. */
  YieldName = 4,
  /** Opens a nested struct container on the assembler stack. */
  OpenStruct = 5,
  /** Opens a nested array container on the assembler stack. */
  OpenArray = 6,
  /** Opens a nested map container on the assembler stack. */
  OpenMap = 7,
  /** Closes the innermost struct/array/map and pops the assembler stack. */
  Close = 8,
  /** GVAS None property tag — pops the assembler stack. */
  PropNone = 9,
  /** Reads a 16-byte Unreal GUID from the file. */
  FieldGuid = 10,
}

export const OPCODE_NAMES: Record<Opcode, string> = {
  [Opcode.FixAscii]: 'FixAscii',
  [Opcode.FixInt32]: 'FixInt32',
  [Opcode.FixUint16]: 'FixUint16',
  [Opcode.FieldString]: 'FieldString',
  [Opcode.YieldName]: 'YieldName',
  [Opcode.OpenStruct]: 'OpenStruct',
  [Opcode.OpenArray]: 'OpenArray',
  [Opcode.OpenMap]: 'OpenMap',
  [Opcode.Close]: 'Close',
  [Opcode.PropNone]: 'PropNone',
  [Opcode.FieldGuid]: 'FieldGuid',
};
