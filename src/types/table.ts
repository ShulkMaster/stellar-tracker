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
    }
  | { kind: 'yieldName'; name: string }
  | { kind: 'openStruct'; name: string }
  | { kind: 'openArray'; name: string }
  | { kind: 'openMap'; name: string }
  | { kind: 'close' }
  | { kind: 'propNone' };

export function isReadStep(row: DecodeStepRow): row is Extract<DecodeStepRow, { kind: 'read' }> {
  return row.kind === 'read';
}
