import type { DecodeStepRow, DecodeValue, TagHeaderField } from 'types/table';
import { BinaryReader } from 'tracker/binaryReader/BinaryReader';
import { toHex } from 'tracker/decoder/decoder';
import { RingBuffer } from 'tracker/ringBuffer/RingBuffer';
import { Opcode, OPCODE_NAMES } from 'tracker/ringBuffer/Opcodes';
import type { ParseFrame, ArrayIterElement } from './ParseFrames';

/**
 * Handlers may return `null` to signal a *scheduler* opcode that pushes
 * further opcodes into the ring buffer but produces no visible step row
 * (e.g. `CustomVersionEntry`). `next()` drains scheduler opcodes
 * transparently and only returns the next concrete row.
 */
type OpcodeHandler = () => DecodeStepRow | null;

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
  /**
   * Element count for `ArrayProperty` Values. Populated by the `ArrayCount`
   * opcode handler after reading the leading Int32; not part of the wire-side
   * tag header. Reset by `makeEmptyTag()` between properties.
   */
  itemCount: number;
};

const NONE_TAG_NAME = 'None';

export class StreamDecoder {
  private readonly _reader: BinaryReader;
  private _state: RingBuffer;
  private _lastYieldName: string | null = null;
  private _customVersionCount = 0;
  /**
   * Index of the *next* `CustomVersionEntry` opcode to fire. Reset when the
   * customVersions block is scheduled in `handleOpenArray`. Each
   * `handleCustomVersionEntry` call snapshots this into
   * `_currentCustomVersionIndex` and increments it by one.
   */
  private _customVersionNextIndex = 0;
  /**
   * Index stamped onto the six sub-rows emitted by the currently in-flight
   * `CustomVersionEntry`. `null` outside of an entry; cleared by the
   * trailing `close` row of the entry.
   */
  private _currentCustomVersionIndex: number | null = null;
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
    [Opcode.ArrayCount]: () => this.handleArrayCount(),
    [Opcode.CustomVersionEntry]: () => this.handleCustomVersionEntry(),
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
    this._customVersionNextIndex = 0;
    this._currentCustomVersionIndex = null;
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
      itemCount: 0,
    };
  }

  /**
   * Opcodes that count as one consumed `ArrayProperty` element when an
   * `arrayIter` frame is on top of the stack. Must mirror the dispatch table
   * in `enqueueArrayElement()`. Anything else (`OpenArray`, `Close`,
   * `TagName`, ...) is ignored by the post-step hook.
   *
   * Body primitive arrays are the only remaining iter-frame caller — the
   * GVAS-header `customVersions` block is now scheduled inline via the
   * `CustomVersionEntry` opcode and never pushes an iter frame.
   */
  private static readonly _arrayElementOpcodes: ReadonlySet<Opcode> = new Set([
    Opcode.FixInt32,
    Opcode.FieldInt64,
    Opcode.FieldFloat32,
    Opcode.FieldDouble64,
    Opcode.FieldByte,
    Opcode.FieldString,
  ]);

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
    // The post-customVersions trailing program (saveClassName/enterBody) is
    // pushed by the iter frame's `trailingOpcodes` callback (or, for an
    // empty customVersions array, inline by `handleOpenArray`). Pushing it
    // here would interleave incorrectly with the per-element opcodes that
    // `advanceArrayIter` lazily appends at the tail of the FIFO queue.
  }

  private enqueueHeaderTrailing(): void {
    this._state.yieldName('saveClassName');
    this._state.fieldString();
    this._state.enterBody();
  }

  public next(): DecodeStepRow {
    while (this.canStep) {
      const opcode = this._state.decode();
      const handler = this._opcodeHandlers[opcode];

      if (handler === undefined) {
        throw new Error(`Unknown opcode identifier ${opcode}`);
      }

      const row = handler();
      if (row === null) {
        // Scheduler opcode (e.g. CustomVersionEntry): produced no visible row,
        // only pushed more opcodes into the ring buffer. Drain and continue.
        continue;
      }
      this.decorateWithCustomVersionIndex(row);
      this.advanceArrayIter(opcode);
      return row;
    }
    throw new Error('next() called with no available opcodes or frames');
  }

  /**
   * Post-step hook for `ArrayProperty` iteration. Runs after every opcode
   * handler. The boundary is any opcode in `_arrayElementOpcodes` (a single
   * read per element — body primitive arrays are the only iter-frame
   * caller). On boundary, decrement `remaining` and either re-enqueue the
   * next element template or tear down the array (`Close` plus the parent
   * `TagName`).
   */
  private advanceArrayIter(executed: Opcode): void {
    const top = this._frames[this._frames.length - 1];
    if (!top || !StreamDecoder._arrayElementOpcodes.has(executed)) {
      return;
    }

    top.remaining -= 1;
    if (top.remaining > 0) {
      this.enqueueArrayElement(top.element);
    } else {
      this._frames.pop();
      this._state.close();
      this._state.tagName();
    }
  }

  /**
   * Stamps the current custom-version entry index onto each sub-row emitted
   * by the in-flight `CustomVersionEntry`. The entry's terminating `close`
   * row also clears the per-entry index so subsequent rows are untagged.
   */
  private decorateWithCustomVersionIndex(row: DecodeStepRow): void {
    if (this._currentCustomVersionIndex === null) {
      return;
    }
    switch (row.kind) {
      case 'openStruct':
      case 'yieldName':
      case 'read':
        row.index = this._currentCustomVersionIndex;
        break;
      case 'close':
        row.index = this._currentCustomVersionIndex;
        this._currentCustomVersionIndex = null;
        break;
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
      this._customVersionNextIndex = 0;
      // GVAS header customVersions is a fully-known, fixed-shape block:
      // N x { GUID(16), Int32 }. Schedule it inline by pushing one
      // CustomVersionEntry; the handler chains itself N times and the
      // last invocation tail-pushes close + the post-header trailing
      // opcodes. No arrayIter frame, no trailing-op closure.
      if (count > 0) {
        this._state.customVersionEntry();
      } else {
        this._state.close();
        this.enqueueHeaderTrailing();
      }
      return { kind: 'openArray', name, count };
    }

    return { kind: 'openArray', name };
  }

  /**
   * Scheduler opcode for one GVAS-header custom-version entry. Snapshots
   * the next entry index, pushes the six sub-opcodes that materialize
   * `{ guid: GUID(16), version: Int32(4) }`, then either chains the next
   * `CustomVersionEntry` (entries remaining) or tail-pushes the array
   * `close` and the post-header trailing opcodes (last entry). Returns
   * `null` so `next()` drains it transparently; the emitted sub-rows are
   * stamped with the snapshot index by `decorateWithCustomVersionIndex`.
   *
   * Self-chaining is necessary because the RingBuffer is FIFO: pushing
   * all N schedulers up-front would interleave their sub-ops AFTER the
   * already-queued close+trailing, desynchronizing the reader.
   */
  private handleCustomVersionEntry(): null {
    this._currentCustomVersionIndex = this._customVersionNextIndex;
    this._customVersionNextIndex += 1;

    this._state.openStruct('');
    this._state.yieldName('guid');
    this._state.fieldGuid();
    this._state.yieldName('version');
    this._state.fixInt32(1);
    this._state.close();

    if (this._customVersionNextIndex < this._customVersionCount) {
      this._state.customVersionEntry();
    } else {
      this._state.close();
      this.enqueueHeaderTrailing();
    }

    return null;
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
    // `int16` is the in-program count argument. The codebase only ever emits
    // `fixInt32(1)` so we assert it inline rather than maintain a dead batch
    // path. Lift this when a real multi-int site appears.
    const count = this._state.int16();
    if (count !== 1) {
      throw new Error(`FixInt32 count must be 1, got ${count}`);
    }
    const start = this._reader.position;
    const value = this._reader.readInt32();

    if (this._lastYieldName === 'customVersionCount') {
      this._customVersionCount = value;
    }

    return this.readStep(Opcode.FixInt32, '1', value, start);
  }

  private handleFixUint16(): Extract<DecodeStepRow, { kind: 'read' }> {
    const count = this._state.int16();
    if (count !== 1) {
      throw new Error(`FixUint16 count must be 1, got ${count}`);
    }
    const start = this._reader.position;
    const value = this._reader.readUint16();
    return this.readStep(Opcode.FixUint16, '1', value, start);
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
        this.enqueueStructValueSequence(propName, this._tag.structType);
        return;
      case 'ArrayProperty':
        this._state.yieldName(propName);
        this._state.arrayCount();
        return;
      default:
        // MapProperty, SetProperty, TextProperty, unknown:
        // emit the field with a placeholder and skip its `size` bytes.
        this._state.yieldName(propName);
        this._state.skipBytes(size);
        break;
    }

    this._state.tagName();
  }

  /**
   * StructProperty value layout depends on `StructType`:
   *
   * - Specialized fixed-layout types (`Vector`, `Rotator`, `Quat`,
   *   `LinearColor`, `Guid`, `DateTime`) are raw bytes — they do NOT enter a
   *   nested property list. The decoder reads them directly and explicitly
   *   re-enqueues a `TagName` to resume the parent property list.
   * - All other `StructType`s are treated as a generic property list ending
   *   in `None`. The terminating `None` (via `handleTagName`) decrements
   *   `_listDepth` and re-enqueues the parent `TagName` itself, so we do NOT
   *   tail-enqueue one here.
   *
   * `propName` (not `structType`) is the assembler key in every branch.
   */
  private enqueueStructValueSequence(propName: string, structType: string): void {
    switch (structType) {
      case 'Vector':
        this._state.openStruct(propName);
        this._state.yieldName('x'); this._state.fieldFloat32();
        this._state.yieldName('y'); this._state.fieldFloat32();
        this._state.yieldName('z'); this._state.fieldFloat32();
        this._state.close();
        this._state.tagName();
        return;

      case 'Rotator':
        this._state.openStruct(propName);
        this._state.yieldName('pitch'); this._state.fieldFloat32();
        this._state.yieldName('yaw');   this._state.fieldFloat32();
        this._state.yieldName('roll');  this._state.fieldFloat32();
        this._state.close();
        this._state.tagName();
        return;

      case 'Quat':
        this._state.openStruct(propName);
        this._state.yieldName('x'); this._state.fieldFloat32();
        this._state.yieldName('y'); this._state.fieldFloat32();
        this._state.yieldName('z'); this._state.fieldFloat32();
        this._state.yieldName('w'); this._state.fieldFloat32();
        this._state.close();
        this._state.tagName();
        return;

      case 'LinearColor':
        this._state.openStruct(propName);
        this._state.yieldName('r'); this._state.fieldFloat32();
        this._state.yieldName('g'); this._state.fieldFloat32();
        this._state.yieldName('b'); this._state.fieldFloat32();
        this._state.yieldName('a'); this._state.fieldFloat32();
        this._state.close();
        this._state.tagName();
        return;

      case 'Guid':
        this._state.fieldGuid();
        this._state.tagName();
        return;

      case 'DateTime':
        this._state.fieldInt64();
        this._state.tagName();
        return;

      default:
        this._state.openStruct(propName);
        this._listDepth++;
        this._state.tagName();
        return;
    }
  }

  /**
   * Reads the leading `Int32 ItemCount` of an `ArrayProperty` Value and
   * dispatches:
   *
   * - `StructProperty` items (out-of-scope for Phase 2): open a placeholder
   *   array, emit a `SkipBytes` over `Tag.Size - 4` bytes (the InnerTag and
   *   item bodies), then close. The placeholder element keeps the assembler
   *   `_pendingName` consumed by the array container; the `<skipped:N>`
   *   string lands inside the array.
   * - All other primitive / FString-shaped items: open the array; if count
   *   is zero, emit `Close + TagName` directly. Otherwise push an
   *   `arrayIter` frame and enqueue the first element opcode — subsequent
   *   elements are queued lazily by `advanceArrayIter()` after each element
   *   read, and the final element triggers `Close + TagName` from the same
   *   hook.
   *
   * Emits a `tagHeader{field:'itemCount'}` step so the UI/log can surface the
   * count inline with the other tag-header rows.
   */
  private handleArrayCount(): DecodeStepRow {
    const start = this._reader.position;
    const n = this._reader.readInt32();
    this._tag.itemCount = n;

    const propName = this._tag.name;
    const itemType = this._tag.itemType;

    if (itemType === 'StructProperty') {
      const consumedInsideValue = this._reader.position - start;
      const remainingBytes = this._tag.size - consumedInsideValue;
      this._state.openArray(propName);
      if (remainingBytes > 0) {
        this._state.skipBytes(remainingBytes);
      }
      this._state.close();
      this._state.tagName();
    } else {
      this._state.openArray(propName);
      if (n === 0) {
        this._state.close();
        this._state.tagName();
      } else {
        const element: ArrayIterElement = { itemType };
        this._frames.push({
          kind: 'arrayIter',
          remaining: n,
          totalCount: n,
          element,
        });
        this.enqueueArrayElement(element);
      }
    }

    return this.tagHeaderStep('itemCount', n, start);
  }

  /**
   * Enqueue one body primitive-array element opcode. Boundary detection in
   * `advanceArrayIter()` pairs with this single read.
   *
   * Per `gvas-format.mdc`, primitive arrays carry no per-element metadata —
   * `BoolProperty` items are raw bytes (not the 0-size + `BoolVal` form used
   * at the property-tag level), and `ByteProperty` items are raw bytes
   * regardless of `EnumName`. That keeps the wire-side invariant simple:
   * every primitive item is exactly N bytes, every FString-shaped item is
   * one length-prefixed string.
   */
  private enqueueArrayElement(element: ArrayIterElement): void {
    switch (element.itemType) {
      case 'IntProperty':
      case 'UInt32Property':
        this._state.fixInt32(1);
        return;
      case 'Int64Property':
        this._state.fieldInt64();
        return;
      case 'FloatProperty':
        this._state.fieldFloat32();
        return;
      case 'DoubleProperty':
        this._state.fieldDouble64();
        return;
      case 'BoolProperty':
      case 'ByteProperty':
        this._state.fieldByte();
        return;
      case 'NameProperty':
      case 'StrProperty':
      case 'EnumProperty':
        this._state.fieldString();
        return;
      default:
        throw new Error(`Unsupported ArrayProperty ItemType: ${element.itemType}`);
    }
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

  private hexFromPosition(start: number): string {
    const end = this._reader.position;
    const view = this._reader._view;
    const bytes = new Uint8Array(view.buffer, view.byteOffset + start, end - start);
    return toHex(bytes);
  }
}
