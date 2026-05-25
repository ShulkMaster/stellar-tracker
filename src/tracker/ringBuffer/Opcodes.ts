export const enum Opcode {
  DummyI32 = 0,
  /**
   * FixAscii is a fixed-length ASCII string opcode.
   * the next uint16 is the length of the string.
   */
  FixAscii = 1,
  /**
   * FixInt32 is a fixed-length 32-bit integer.
   * the next uint16 is the number of 32-bit integers to read.
   */
  FixInt32 = 2,
  /**
   * FixUint16 is a fixed-length 16-bit unsigned integer.
   * the next uint16 is the number of 16-bit integers to read.
   */
  FixUint16 = 3,
  /**
   * FieldString reads an Unreal FString from the file.
   */
  FieldString = 4,
  /** Announces the property name for the next read step. */
  YieldName = 5,
  /** Opens a nested struct container on the assembler stack. */
  OpenStruct = 6,
  /** Opens a nested array container on the assembler stack. */
  OpenArray = 7,
  /** Opens a nested map container on the assembler stack. */
  OpenMap = 8,
  /** Closes the innermost struct/array/map and pops the assembler stack. */
  Close = 9,
  /** GVAS None property tag — pops the assembler stack. */
  PropNone = 10,
}

export const OPCODE_NAMES: Record<Opcode, string> = {
  [Opcode.DummyI32]: 'DummyI32',
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
};
