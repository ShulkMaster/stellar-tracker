export interface DataRow {
  type: string;
  value: any;
  byteRange: string;
  byteData: string;
}

export interface DecodeStepRow {
  opcode: string;
  args: string;
  value: string | number | number[];
  bytes: string;
}
