import type { DecodeStepRow, DecodeValue } from '../../types/table.ts';
import { BinaryReader } from '../binaryReader/BinaryReader.ts';
import { toHex } from '../decoder/decoder.ts';
import { RingBuffer } from '../ringBuffer/RingBuffer.ts';
import { Opcode, OPCODE_NAMES } from '../ringBuffer/Opcodes.ts';
import { ARRAY_SCHEMAS, type FieldSpec, type ParseFrame } from './ParseFrames.ts';

type OpcodeHandler = () => DecodeStepRow;

function defineOpcodeHandlers(
  handlers: { [K in Opcode]: OpcodeHandler },
): Record<Opcode, OpcodeHandler> {
  return handlers;
}

export class StreamDecoder {
  private readonly _reader: BinaryReader;
  private _state: RingBuffer;
  private _lastYieldName: string | null = null;
  private _customVersionCount = 0;
  private readonly _frames: ParseFrame[] = [];

  private readonly _opcodeHandlers = defineOpcodeHandlers({
    [Opcode.FixAscii]: () => this.handleFixAscii(),
    [Opcode.FixInt32]: () => this.handleFixInt32(),
    [Opcode.FixUint16]: () => this.handleFixUint16(),
    [Opcode.FieldString]: () => this.handleFieldString(),
    [Opcode.FieldGuid]: () => this.handleFieldGuid(),
    [Opcode.YieldName]: () => this.handleYieldName(),
    [Opcode.OpenStruct]: () => this.handleOpenStruct(),
    [Opcode.OpenArray]: () => this.handleOpenArray(),
    [Opcode.OpenMap]: () => this.handleOpenMap(),
    [Opcode.Close]: () => this.handleClose(),
    [Opcode.PropNone]: () => this.handlePropNone(),
  });

  constructor(reader: BinaryReader) {
    this._reader = reader;
    this._state = RingBuffer.create(1024);
    this.initializeState();
  }

  public get canStep(): boolean {
    return this._state.available > 0 || this._frames.length > 0;
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
    this._lastYieldName = null;
    this._customVersionCount = 0;
    this._frames.length = 0;
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
    if (this._frames.length > 0) {
      return this.dispatchFrame();
    }

    const opcode = this._state.decode();
    const handler = this._opcodeHandlers[opcode];

    if (handler === undefined) {
      throw new Error(`Unknown opcode identifier ${opcode}`);
    }

    return handler();
  }

  private dispatchFrame(): DecodeStepRow {
    const top = this._frames[this._frames.length - 1]!;

    if (top.kind === 'array') {
      if (top.index < top.count) {
        this._frames.push({
          kind: 'struct',
          arrayIndex: top.index,
          fields: top.item,
          fieldIndex: 0,
          phase: 'yieldName',
        });
        return { kind: 'openStruct', name: '', index: top.index };
      }

      this._frames.pop();
      return { kind: 'close' };
    }

    if (top.phase === 'yieldName') {
      if (top.fieldIndex >= top.fields.length) {
        const arrayFrame = this._frames[this._frames.length - 2];
        if (arrayFrame === undefined || arrayFrame.kind !== 'array') {
          throw new Error('Struct frame is not nested inside an array frame');
        }
        const closedIndex = arrayFrame.index;
        arrayFrame.index++;
        this._frames.pop();
        return { kind: 'close', index: closedIndex };
      }

      const field = top.fields[top.fieldIndex]!;
      top.phase = 'read';
      return { kind: 'yieldName', name: field.name, index: top.arrayIndex };
    }

    const field = top.fields[top.fieldIndex]!;
    top.fieldIndex++;
    top.phase = 'yieldName';
    return this.readField(field, top.arrayIndex);
  }

  private readField(field: FieldSpec, index: number): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;

    switch (field.opcode) {
      case Opcode.FieldGuid: {
        const value = this._reader.readGUID();
        return this.readStep(Opcode.FieldGuid, '', value, start, index);
      }
      case Opcode.FieldString: {
        const value = this._reader.readString();
        return this.readStep(Opcode.FieldString, '', value, start, index);
      }
      case Opcode.FixInt32: {
        const count = field.args ?? 1;
        const value = count === 1 ? this._reader.readInt32() : this.readInt32Batch(count);
        return this.readStep(Opcode.FixInt32, String(count), value, start, index);
      }
      case Opcode.FixUint16: {
        const count = field.args ?? 1;
        const value = count === 1 ? this._reader.readUint16() : this.readUint16Batch(count);
        return this.readStep(Opcode.FixUint16, String(count), value, start, index);
      }
      case Opcode.FixAscii: {
        const count = field.args ?? 0;
        const value = this._reader.readASCII(count);
        return this.readStep(Opcode.FixAscii, String(count), value, start, index);
      }
      default:
        throw new Error(`Unsupported field opcode in frame dispatcher: ${field.opcode}`);
    }
  }

  private handleYieldName(): Extract<DecodeStepRow, { kind: 'yieldName' }> {
    const name = this.readProgramName();
    this._lastYieldName = name;
    return { kind: 'yieldName', name };
  }

  private handleOpenStruct(): Extract<DecodeStepRow, { kind: 'openStruct' }> {
    return { kind: 'openStruct', name: this.readProgramName() };
  }

  private handleOpenArray(): Extract<DecodeStepRow, { kind: 'openArray' }> {
    const name = this.readProgramName();
    const schema = ARRAY_SCHEMAS[name];

    if (schema !== undefined) {
      const count = this.resolveArrayCount(name);
      this.enqueueArrayTail(name);
      this._frames.push({
        kind: 'array',
        name,
        count,
        index: 0,
        item: schema,
      });
      return { kind: 'openArray', name, count };
    }

    return { kind: 'openArray', name };
  }

  private handleOpenMap(): Extract<DecodeStepRow, { kind: 'openMap' }> {
    return { kind: 'openMap', name: this.readProgramName() };
  }

  private handleClose(): Extract<DecodeStepRow, { kind: 'close' }> {
    return { kind: 'close' };
  }

  private handlePropNone(): Extract<DecodeStepRow, { kind: 'propNone' }> {
    return { kind: 'propNone' };
  }

  private handleFixAscii(): Extract<DecodeStepRow, { kind: 'read' }> {
    const len = this._state.int16();
    const start = this._reader.position;
    const value = this._reader.readASCII(len);
    return this.readStep(Opcode.FixAscii, String(len), value, start);
  }

  private handleFixInt32(): Extract<DecodeStepRow, { kind: 'read' }> {
    const count = this._state.int16();
    const start = this._reader.position;
    const value = count === 1
      ? this._reader.readInt32()
      : this.readInt32Batch(count);

    if (this._lastYieldName === 'customVersionCount' && count === 1) {
      this._customVersionCount = value as number;
    }

    return this.readStep(Opcode.FixInt32, String(count), value, start);
  }

  private handleFixUint16(): Extract<DecodeStepRow, { kind: 'read' }> {
    const count = this._state.int16();
    const start = this._reader.position;
    const value = count === 1
      ? this._reader.readUint16()
      : this.readUint16Batch(count);
    return this.readStep(Opcode.FixUint16, String(count), value, start);
  }

  private handleFieldString(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const value = this._reader.readString();
    return this.readStep(Opcode.FieldString, '', value, start);
  }

  private handleFieldGuid(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const value = this._reader.readGUID();
    return this.readStep(Opcode.FieldGuid, '', value, start);
  }

  private resolveArrayCount(name: string): number {
    if (name === 'customVersions') {
      return this._customVersionCount;
    }
    return 0;
  }

  /**
   * Linear scalar program that follows the array on the wire. Enqueued onto
   * the RingBuffer so the regular opcode dispatcher resumes after the frame
   * stack empties — not an array-body expansion.
   */
  private enqueueArrayTail(name: string): void {
    if (name === 'customVersions') {
      this._state.yieldName('saveClassName');
      this._state.fieldString();
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
    index?: number,
  ): Extract<DecodeStepRow, { kind: 'read' }> {
    const row: Extract<DecodeStepRow, { kind: 'read' }> = {
      kind: 'read',
      opcode: OPCODE_NAMES[opcode],
      args,
      value,
      bytes: this.hexFromPosition(start),
    };
    if (index !== undefined) {
      row.index = index;
    }
    return row;
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
