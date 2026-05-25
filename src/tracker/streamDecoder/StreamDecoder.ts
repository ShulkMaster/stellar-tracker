import type { DecodeStepRow, DecodeValue, TagHeaderField } from 'types/table';
import { BinaryReader } from 'tracker/binaryReader/BinaryReader';
import { toHex } from 'tracker/decoder/decoder';
import { RingBuffer } from 'tracker/ringBuffer/RingBuffer';
import { Opcode, OPCODE_NAMES } from 'tracker/ringBuffer/Opcodes';
import type { ParseFrame } from './ParseFrames';

type OpcodeHandler = () => DecodeStepRow;

function defineOpcodeHandlers(
  handlers: { [K in Opcode]: OpcodeHandler },
): Record<Opcode, OpcodeHandler> {
  return handlers;
}

type TagState = {
  name: string;
  type: string;
  size: number;
  arrayIndex: number;
  hasGuid: boolean;
  structType: string;
  structGuid: string;
  enumName: string;
  boolVal: boolean;
  itemType: string;
  keyType: string;
  valueType: string;
};

const NONE_TAG_NAME = 'None';

export class StreamDecoder {
  private readonly _reader: BinaryReader;
  private _state: RingBuffer;
  private _lastYieldName: string | null = null;
  private _customVersionCount = 0;
  private readonly _frames: ParseFrame[] = [];
  private _tag: TagState = StreamDecoder.makeEmptyTag();
  /**
   * Depth of nested property lists currently open (`body` + StructProperty
   * values). Incremented on list entry, decremented when a `None` terminator
   * is read. Used so the `None`-detecting `TagName` can resume the parent
   * list — pre-queueing the outer `TagName` doesn't work because the RingBuffer
   * is FIFO and the parent's tag would fire before the inner tag's metadata.
   */
  private _listDepth = 0;

  private readonly _opcodeHandlers = defineOpcodeHandlers({
    [Opcode.FixAscii]: () => this.handleFixAscii(),
    [Opcode.FixInt32]: () => this.handleFixInt32(),
    [Opcode.FixUint16]: () => this.handleFixUint16(),
    [Opcode.FieldString]: () => this.handleFieldString(),
    [Opcode.FieldGuid]: () => this.handleFieldGuid(),
    [Opcode.FieldInt64]: () => this.handleFieldInt64(),
    [Opcode.FieldFloat32]: () => this.handleFieldFloat32(),
    [Opcode.FieldDouble64]: () => this.handleFieldDouble64(),
    [Opcode.FieldByte]: () => this.handleFieldByte(),
    [Opcode.ValBool]: () => this.handleValBool(),
    [Opcode.YieldName]: () => this.handleYieldName(),
    [Opcode.OpenStruct]: () => this.handleOpenStruct(),
    [Opcode.OpenArray]: () => this.handleOpenArray(),
    [Opcode.OpenMap]: () => this.handleOpenMap(),
    [Opcode.Close]: () => this.handleClose(),
    [Opcode.PropNone]: () => this.handlePropNone(),
    [Opcode.EnterBody]: () => this.handleEnterBody(),
    [Opcode.SkipBytes]: () => this.handleSkipBytes(),
    [Opcode.TagName]: () => this.handleTagName(),
    [Opcode.TagType]: () => this.handleTagType(),
    [Opcode.TagSize]: () => this.handleTagSize(),
    [Opcode.TagArrayIndex]: () => this.handleTagArrayIndex(),
    [Opcode.TagGuidFlag]: () => this.handleTagGuidFlag(),
    [Opcode.TagPropGuid]: () => this.handleTagPropGuid(),
    [Opcode.TagStructType]: () => this.handleTagStructType(),
    [Opcode.TagStructGuid]: () => this.handleTagStructGuid(),
    [Opcode.TagBoolVal]: () => this.handleTagBoolVal(),
    [Opcode.TagEnumName]: () => this.handleTagEnumName(),
    [Opcode.TagItemType]: () => this.handleTagItemType(),
    [Opcode.TagKeyType]: () => this.handleTagKeyType(),
    [Opcode.TagValueType]: () => this.handleTagValueType(),
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
    this._tag = StreamDecoder.makeEmptyTag();
    this._listDepth = 0;
    this.initializeState();
  }

  private static makeEmptyTag(): TagState {
    return {
      name: '',
      type: '',
      size: 0,
      arrayIndex: 0,
      hasGuid: false,
      structType: '',
      structGuid: '',
      enumName: '',
      boolVal: false,
      itemType: '',
      keyType: '',
      valueType: '',
    };
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
    this._state.yieldName('saveClassName');
    this._state.fieldString();
    this._state.enterBody();
  }

  public next(): DecodeStepRow {
    if (this._frames.length > 0) {
      const top = this._frames[this._frames.length - 1]!;
      if (top.kind === 'customVersions') {
        return this.dispatchCustomVersions(top);
      }
    }

    const opcode = this._state.decode();
    const handler = this._opcodeHandlers[opcode];

    if (handler === undefined) {
      throw new Error(`Unknown opcode identifier ${opcode}`);
    }

    return handler();
  }

  /**
   * Header customVersions: 56 entries of `{guid: GUID, version: Int32}`.
   * Item layout is hardcoded here (not driven by a schema map) and emits the
   * same event sequence the assembler already understands.
   */
  private dispatchCustomVersions(frame: ParseFrame & { kind: 'customVersions' }): DecodeStepRow {
    if (frame.index >= frame.count) {
      this._frames.pop();
      return { kind: 'close' };
    }

    switch (frame.phase) {
      case 'open': {
        frame.phase = 'guidName';
        return { kind: 'openStruct', name: '', index: frame.index };
      }
      case 'guidName': {
        frame.phase = 'guid';
        return { kind: 'yieldName', name: 'guid', index: frame.index };
      }
      case 'guid': {
        const start = this._reader.position;
        const value = this._reader.readGUID();
        frame.phase = 'versionName';
        return this.readStep(Opcode.FieldGuid, '', value, start, frame.index);
      }
      case 'versionName': {
        frame.phase = 'version';
        return { kind: 'yieldName', name: 'version', index: frame.index };
      }
      case 'version': {
        const start = this._reader.position;
        const value = this._reader.readInt32();
        frame.phase = 'close';
        return this.readStep(Opcode.FixInt32, '1', value, start, frame.index);
      }
      case 'close': {
        const closedIndex = frame.index;
        frame.index++;
        frame.phase = 'open';
        return { kind: 'close', index: closedIndex };
      }
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

    if (name === 'customVersions') {
      const count = this._customVersionCount;
      this._frames.push({
        kind: 'customVersions',
        count,
        index: 0,
        phase: 'open',
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

  private handleFieldInt64(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const value = this._reader.readInt64();
    return this.readStep(Opcode.FieldInt64, '', value, start);
  }

  private handleFieldFloat32(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const value = this._reader.readFloat32();
    return this.readStep(Opcode.FieldFloat32, '', value, start);
  }

  private handleFieldDouble64(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const value = this._reader.readFloat64();
    return this.readStep(Opcode.FieldDouble64, '', value, start);
  }

  private handleFieldByte(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const value = this._reader.readByte();
    return this.readStep(Opcode.FieldByte, '', value, start);
  }

  /** ValBool emits the cached BoolProperty value without consuming wire bytes. */
  private handleValBool(): Extract<DecodeStepRow, { kind: 'read' }> {
    return {
      kind: 'read',
      opcode: OPCODE_NAMES[Opcode.ValBool],
      args: '',
      value: this._tag.boolVal,
      bytes: '',
    };
  }

  /**
   * EnterBody only enqueues body parsing if the reader still has bytes after
   * the header. This keeps header-only fixtures (e.g. tests) terminating cleanly.
   */
  private handleEnterBody(): DecodeStepRow {
    const hasBody = this._reader.position < this._reader.size;
    if (hasBody) {
      this._state.openStruct('body');
      this._listDepth++;
      this._state.tagName();
    }
    return {
      kind: 'control',
      label: 'EnterBody',
      detail: hasBody ? 'enter' : 'eof',
    };
  }

  private handleSkipBytes(): Extract<DecodeStepRow, { kind: 'read' }> {
    const count = this._state.uint32();
    const start = this._reader.position;
    const end = Math.min(start + count, this._reader.size);
    this._reader.seek(end);
    return {
      kind: 'read',
      opcode: OPCODE_NAMES[Opcode.SkipBytes],
      args: String(count),
      value: `<skipped:${count}>`,
      bytes: '',
      ...(this._tag.arrayIndex > 0 ? { index: this._tag.arrayIndex } : {}),
    };
  }

  // ───────────────────────── property tag state machine ────────────────────────

  private handleTagName(): DecodeStepRow {
    const start = this._reader.position;
    const name = this._reader.readString();
    this._tag = StreamDecoder.makeEmptyTag();
    this._tag.name = name;

    if (name === NONE_TAG_NAME) {
      this._state.propNone();
      this._listDepth--;
      // If a parent property list is still open, resume it by enqueuing
      // another TagName *after* the PropNone has popped the inner container.
      if (this._listDepth > 0) {
        this._state.tagName();
      }
      return this.tagHeaderStep('name', name, start);
    }

    this._state.tagType();
    this._state.tagSize();
    this._state.tagArrayIndex();
    return this.tagHeaderStep('name', name, start);
  }

  private handleTagType(): DecodeStepRow {
    const start = this._reader.position;
    const type = this._reader.readString();
    this._tag.type = type;
    return this.tagHeaderStep('type', type, start);
  }

  private handleTagSize(): DecodeStepRow {
    const start = this._reader.position;
    const size = this._reader.readInt32();
    this._tag.size = size;
    return this.tagHeaderStep('size', size, start);
  }

  private handleTagArrayIndex(): DecodeStepRow {
    const start = this._reader.position;
    const arrayIndex = this._reader.readInt32();
    this._tag.arrayIndex = arrayIndex;
    this.enqueueTypeSpecificMetadata(this._tag.type);
    this._state.tagGuidFlag();
    return this.tagHeaderStep('arrayIndex', arrayIndex, start);
  }

  private handleTagGuidFlag(): DecodeStepRow {
    const start = this._reader.position;
    const flag = this._reader.readByte();
    this._tag.hasGuid = flag === 1;
    if (this._tag.hasGuid) {
      this._state.tagPropGuid();
    }
    this.enqueueValueSequence(this._tag.type);
    return this.tagHeaderStep('guidFlag', flag, start);
  }

  private handleTagPropGuid(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readGUID();
    return this.tagHeaderStep('guid', value, start);
  }

  private handleTagStructType(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readString();
    this._tag.structType = value;
    return this.tagHeaderStep('structType', value, start);
  }

  private handleTagStructGuid(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readGUID();
    this._tag.structGuid = value;
    return this.tagHeaderStep('structGuid', value, start);
  }

  private handleTagBoolVal(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readByte();
    this._tag.boolVal = value !== 0;
    return this.tagHeaderStep('boolVal', value, start);
  }

  private handleTagEnumName(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readString();
    this._tag.enumName = value;
    return this.tagHeaderStep('enumName', value, start);
  }

  private handleTagItemType(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readString();
    this._tag.itemType = value;
    return this.tagHeaderStep('itemType', value, start);
  }

  private handleTagKeyType(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readString();
    this._tag.keyType = value;
    return this.tagHeaderStep('keyType', value, start);
  }

  private handleTagValueType(): DecodeStepRow {
    const start = this._reader.position;
    const value = this._reader.readString();
    this._tag.valueType = value;
    return this.tagHeaderStep('valueType', value, start);
  }

  /**
   * Pushes the type-specific metadata that precedes the HasPropertyGuid byte.
   * No-op for primitives that have no metadata.
   */
  private enqueueTypeSpecificMetadata(type: string): void {
    switch (type) {
      case 'BoolProperty':
        this._state.tagBoolVal();
        return;
      case 'ByteProperty':
      case 'EnumProperty':
        this._state.tagEnumName();
        return;
      case 'StructProperty':
        this._state.tagStructType();
        this._state.tagStructGuid();
        return;
      case 'ArrayProperty':
      case 'SetProperty':
        this._state.tagItemType();
        return;
      case 'MapProperty':
        this._state.tagKeyType();
        this._state.tagValueType();
        return;
      default:
        return;
    }
  }

  /**
   * Pushes the value-reading opcodes for the current tag, followed by a
   * trailing `TagName` that resumes the surrounding property list.
   */
  private enqueueValueSequence(type: string): void {
    const propName = this._tag.name;
    const size = this._tag.size;

    switch (type) {
      case 'IntProperty':
      case 'UInt32Property':
        this._state.yieldName(propName);
        this._state.fixInt32(1);
        break;
      case 'Int64Property':
        this._state.yieldName(propName);
        this._state.fieldInt64();
        break;
      case 'FloatProperty':
        this._state.yieldName(propName);
        this._state.fieldFloat32();
        break;
      case 'DoubleProperty':
        this._state.yieldName(propName);
        this._state.fieldDouble64();
        break;
      case 'StrProperty':
      case 'NameProperty':
        this._state.yieldName(propName);
        this._state.fieldString();
        break;
      case 'BoolProperty':
        this._state.yieldName(propName);
        this._state.valBool();
        break;
      case 'ByteProperty':
        this._state.yieldName(propName);
        if (this._tag.enumName !== '' && this._tag.enumName !== NONE_TAG_NAME) {
          this._state.fieldString();
        } else {
          this._state.fieldByte();
        }
        break;
      case 'EnumProperty':
        this._state.yieldName(propName);
        this._state.fieldString();
        break;
      case 'StructProperty':
        this._state.yieldName(propName);
        this._state.openStruct(this._tag.structType);
        // Enter a nested property list. The list's terminating `None` (via
        // handleTagName) decrements `_listDepth` and re-enqueues a `TagName`
        // for the parent list — pre-queueing it here would put it ahead of
        // the inner property's metadata in the FIFO queue.
        this._listDepth++;
        this._state.tagName();
        return;
      default:
        // ArrayProperty, MapProperty, SetProperty, TextProperty, unknown:
        // emit the field with a placeholder and skip its `size` bytes.
        this._state.yieldName(propName);
        this._state.skipBytes(size);
        break;
    }

    this._state.tagName();
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private readProgramName(): string {
    const len = this._state.int16();
    return this._state.ascii(len);
  }

  private tagHeaderStep(
    field: TagHeaderField,
    value: DecodeValue,
    start: number,
  ): Extract<DecodeStepRow, { kind: 'tagHeader' }> {
    return {
      kind: 'tagHeader',
      field,
      value,
      bytes: this.hexFromPosition(start),
    };
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
