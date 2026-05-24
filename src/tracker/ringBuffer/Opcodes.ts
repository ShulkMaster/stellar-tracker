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
};
