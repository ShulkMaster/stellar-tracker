import type { DecodeStepRow, DecodeValue } from '../../types/table.ts';
import { BinaryReader } from '../binaryReader/BinaryReader.ts';
import { toHex } from '../decoder/decoder.ts';
import { RingBuffer } from '../ringBuffer/RingBuffer.ts';
import { Opcode, OPCODE_NAMES } from '../ringBuffer/Opcodes.ts';

export class StreamDecoder {
  private readonly _reader: BinaryReader;
  private _state: RingBuffer;

  constructor(reader: BinaryReader) {
    this._reader = reader;
    this._state = RingBuffer.create(1024);
    this.initializeState();
  }

  public get canStep(): boolean {
    return this._state.available > 0;
  }

  public get position(): number {
    return this._reader.position;
  }

  public get totalSize(): number {
    return this._reader.size;
  }

  public reset(): void {
    this._reader.seek(0);
    this._state = RingBuffer.create(1024);
    this.initializeState();
  }

  private initializeState(): void {
    this._state.yieldName('stelarHeader');
    this._state.fixAscii(4);
    this._state.yieldName('stelarVersion');
    this._state.fixInt32(1);
    this._state.yieldName('unrealHeader');
    this._state.fixAscii(4);
    this._state.yieldName('unrealVersion');
    this._state.fixInt32(1);
    this._state.yieldName('packageVersion');
    this._state.fixInt32(1);
    this._state.yieldName('majorVersion');
    this._state.fixUint16(1);
    this._state.yieldName('minorVersion');
    this._state.fixUint16(1);
    this._state.yieldName('patchVersion');
    this._state.fixUint16(1);
    this._state.yieldName('changelistVersion');
    this._state.fixInt32(1);
    this._state.yieldName('engineBranch');
    this._state.fieldString();
    this._state.yieldName('customVersionFormat');
    this._state.fixInt32(1);
    this._state.yieldName('customVersionCount');
    this._state.fixInt32(1);
    this._state.openArray('customVersions');
  }

  public next(): DecodeStepRow {
    const opcode = this._state.decode();

    switch (opcode) {
      case Opcode.YieldName:
        return { kind: 'yieldName', name: this.readProgramName() };
      case Opcode.OpenStruct:
        return { kind: 'openStruct', name: this.readProgramName() };
      case Opcode.OpenArray:
        return { kind: 'openArray', name: this.readProgramName() };
      case Opcode.OpenMap:
        return { kind: 'openMap', name: this.readProgramName() };
      case Opcode.Close:
        return { kind: 'close' };
      case Opcode.PropNone:
        return { kind: 'propNone' };
      case Opcode.FixAscii: {
        const len = this._state.int16();
        const start = this._reader.position;
        const value = this._reader.readASCII(len);
        return this.readStep(opcode, String(len), value, start);
      }
      case Opcode.FixInt32: {
        const count = this._state.int16();
        const start = this._reader.position;
        const value = count === 1
          ? this._reader.readInt32()
          : this.readInt32Batch(count);
        return this.readStep(opcode, String(count), value, start);
      }
      case Opcode.FixUint16: {
        const count = this._state.int16();
        const start = this._reader.position;
        const value = count === 1
          ? this._reader.readUint16()
          : this.readUint16Batch(count);
        return this.readStep(opcode, String(count), value, start);
      }
      case Opcode.FieldString: {
        const start = this._reader.position;
        const value = this._reader.readString();
        return this.readStep(opcode, '', value, start);
      }
      default:
        throw new Error(`Unknown opcode identifier ${opcode}`);
    }
  }

  private readProgramName(): string {
    const len = this._state.int16();
    return this._state.ascii(len);
  }

  private readStep(
    opcode: Opcode,
    args: string,
    value: DecodeValue,
    start: number,
  ): Extract<DecodeStepRow, { kind: 'read' }> {

    return {
      kind: 'read',
      opcode: OPCODE_NAMES[opcode],
      args,
      value,
      bytes: this.hexFromPosition(start),
    };
  }

  private readInt32Batch(count: number): number[] {
    const result = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      result[i] = this._reader.readInt32();
    }
    return result;
  }

  private readUint16Batch(count: number): number[] {
    const result = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      result[i] = this._reader.readUint16();
    }
    return result;
  }

  private hexFromPosition(start: number): string {
    const end = this._reader.position;
    const view = this._reader._view;
    const bytes = new Uint8Array(view.buffer, view.byteOffset + start, end - start);
    return toHex(bytes);
  }
}
