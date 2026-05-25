export interface DataRow {
  type: string;
  value: any;
  byteRange: string;
  byteData: string;
}

export type DecodeValue = string | number | number[] | bigint | boolean;

export type DecodeStepRow =
  | {
      kind: 'read';
      opcode: string;
      args: string;
      value: DecodeValue;
      bytes: string;
      index?: number;
    }
  | { kind: 'yieldName'; name: string; index?: number }
  | { kind: 'openStruct'; name: string; index?: number }
  | { kind: 'openArray'; name: string; count?: number }
  | { kind: 'openMap'; name: string }
  | { kind: 'close'; index?: number }
  | { kind: 'propNone' };

export function isReadStep(row: DecodeStepRow): row is Extract<DecodeStepRow, { kind: 'read' }> {
  return row.kind === 'read';
}
