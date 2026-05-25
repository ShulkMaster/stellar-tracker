export interface DataRow {
  type: string;
  value: any;
  byteRange: string;
  byteData: string;
}

export type DecodeValue = string | number | number[] | bigint | boolean;

export type TagHeaderField =
  | 'name'
  | 'type'
  | 'size'
  | 'arrayIndex'
  | 'guidFlag'
  | 'guid'
  | 'structType'
  | 'structGuid'
  | 'enumName'
  | 'boolVal'
  | 'itemType'
  | 'keyType'
  | 'valueType';

export type DecodeStepRow =
  | {
      kind: 'read';
      opcode: string;
      args: string;
      value: DecodeValue;
      bytes: string;
      index?: number;
    }
  | {
      kind: 'tagHeader';
      field: TagHeaderField;
      value: DecodeValue;
      bytes: string;
    }
  | { kind: 'control'; label: string; detail?: string }
  | { kind: 'yieldName'; name: string; index?: number }
  | { kind: 'openStruct'; name: string; index?: number }
  | { kind: 'openArray'; name: string; count?: number }
  | { kind: 'openMap'; name: string }
  | { kind: 'close'; index?: number }
  | { kind: 'propNone' };

export function isReadStep(row: DecodeStepRow): row is Extract<DecodeStepRow, { kind: 'read' }> {
  return row.kind === 'read';
}

export function isTagHeaderStep(
  row: DecodeStepRow,
): row is Extract<DecodeStepRow, { kind: 'tagHeader' }> {
  return row.kind === 'tagHeader';
}
