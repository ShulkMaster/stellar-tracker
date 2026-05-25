import { Opcode } from '../ringBuffer/Opcodes.ts';

/** Describes one field inside a struct element of an array. */
export type FieldSpec = {
  name: string;
  opcode: Opcode;
  /** Optional count argument for batchable opcodes (e.g. FixInt32). Defaults to 1. */
  args?: number;
};

/** Decoder-side frame stack: tracks array iteration and per-element field walk. */
export type ParseFrame =
  | {
      kind: 'array';
      name: string;
      count: number;
      index: number;
      item: readonly FieldSpec[];
    }
  | {
      kind: 'struct';
      arrayIndex: number;
      fields: readonly FieldSpec[];
      fieldIndex: number;
      /** Tracks the openStruct → yieldName → read sub-step within a single field. */
      phase: 'yieldName' | 'read';
    };

/** Schemas keyed by header array name. */
export const ARRAY_SCHEMAS: Record<string, readonly FieldSpec[]> = {
  customVersions: [
    { name: 'guid', opcode: Opcode.FieldGuid },
    { name: 'version', opcode: Opcode.FixInt32, args: 1 },
  ],
};
