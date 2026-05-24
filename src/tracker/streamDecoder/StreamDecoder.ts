import type { DecodeStepRow } from 'types/table';
import { BinaryReader } from '../binaryReader/BinaryReader';
import { toHex } from '../decoder/decoder';
import { RingBuffer } from 'tracker/ringBuffer/RingBuffer';
import { Opcode, OPCODE_NAMES } from 'tracker/ringBuffer/Opcodes';

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
    // EVAS header
    this._state.fixAscii(4);
    // EVAS version
    this._state.fixInt32(1);
  }

  public next(): DecodeStepRow {
    const opcode = this._state.decode();

    switch (opcode) {
      case Opcode.DummyI32: {
        const start = this._reader.position;
        const value = this._reader.readInt32();
        return {
          opcode: OPCODE_NAMES[opcode],
          args: '',
          value,
          bytes: this.hexFromPosition(start),
        };
      }
      case Opcode.FixAscii: {
        const len = this._state.int16();
        const start = this._reader.position;
        const value = this._reader.readASCII(len);
        return {
          opcode: OPCODE_NAMES[opcode],
          args: String(len),
          value,
          bytes: this.hexFromPosition(start),
        };
      }
      case Opcode.FixInt32: {
        const count = this._state.int16();
        const start = this._reader.position;
        const value = count === 1
          ? this._reader.readInt32()
          : this.readInt32Batch(count);
        return {
          opcode: OPCODE_NAMES[opcode],
          args: String(count),
          value,
          bytes: this.hexFromPosition(start),
        };
      }
      default:
        throw new Error(`Unknown opcode identifier ${opcode}`);
    }
  }

  private readInt32Batch(count: number): number[] {
    const result = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      result[i] = this._reader.readInt32();
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
