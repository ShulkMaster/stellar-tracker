import type { DecodeStepRow, DecodeValue, TagHeaderField } from 'types/table';
import { BinaryReader } from 'parser/binaryReader/BinaryReader';
import { toHex } from 'parser/decoder/decoder';
import { RingBuffer } from 'parser/ringBuffer/RingBuffer';
import { Opcode, OPCODE_NAMES } from 'parser/ringBuffer/Opcodes';
import type {
  ParseFrame,
  ArrayIterElement,
  ArrayIterFrame,
  SetIterFrame,
  MapIterFrame,
} from './ParseFrames';
import {
  floatStructFields,
  isGenericStructType,
  isPrimitiveElementOpcode,
  mapStructValueType,
  scalarStructOpcode,
} from './propertyLayouts';
import {
  readMapKey,
  readMapStructKeyHeader,
  readSharedStructArrayDescriptor,
} from './wireReaders';

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
  /**
   * Entry count for `MapProperty` Values. Populated by the `MapCount` opcode
   * handler after the 4-byte padding + Int32 EntryCount; not part of the
   * wire-side tag header. Reset by `makeEmptyTag()` between properties.
   */
  entryCount: number;
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
  /** `_listDepth` immediately before the most recent `None` tag decrement. */
  private _noneDepthBefore: number | null = null;

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
    [Opcode.FieldInt8]: () => this.handleFieldInt8(),
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
    [Opcode.MapCount]: () => this.handleMapCount(),
    [Opcode.MapEntry]: () => this.handleMapEntry(),
    [Opcode.ArrayEntry]: () => this.handleArrayEntry(),
    [Opcode.SetCount]: () => this.handleSetCount(),
    [Opcode.TextPropertyValue]: () => this.handleTextPropertyValue(),
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

  /**
   * Number of active iteration frames (`arrayIter` / `mapIter`). A non-zero
   * value means a step-loop driver is currently *inside* one or more
   * arrays/maps. The UI uses this to enable a "skip to end of current
   * iteration" control so users don't have to advance through every
   * element of a large container by hand.
   */
  public get framesDepth(): number {
    return this._frames.length;
  }

  /**
   * Discriminator of the innermost iteration frame, or `null` when no
   * iteration is active. Lets the UI label its "skip" affordance with
   * the right noun (`"array"` vs `"map"`).
   */
  public get currentIterKind(): 'arrayIter' | 'setIter' | 'mapIter' | null {
    const top = this._frames[this._frames.length - 1];
    return top ? top.kind : null;
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
    this._noneDepthBefore = null;
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
      entryCount: 0,
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
    // The post-customVersions trailing program (saveClassName/enterBody) is
    // pushed after customVersions have been decoded. Pushing it here would
    // interleave incorrectly with the per-entry scheduler opcodes.
  }

  private enqueueHeaderTrailing(): void {
    this._state.yieldName('saveClassName');
    this._state.fieldString();
    this._state.enterBody();
  }

  /**
   * When the opcode queue is empty but an iter frame remains, enqueue the next
   * scheduler step. Avoids ring-buffer underflow after nested containers.
   */
  private ensureIterContinuity(): void {
    if (this._state.available > 0 || this._reader.position >= this._reader.size) {
      return;
    }
    const top = this.currentFrame();
    if (!top || top.remaining <= 0) {
      return;
    }
    if (top.kind === 'mapIter') {
      this._state.mapEntry();
      return;
    }
    if (top.kind === 'setIter') {
      if (top.element.itemType === 'StructProperty') {
        this._state.arrayEntry();
      } else {
        this.enqueueArrayElement(top.element);
      }
      return;
    }
    if (top.kind === 'arrayIter') {
      if (top.sharedStruct && this._listDepth > top.entryStartListDepth) {
        this._state.tagName();
      } else if (
        top.element.itemType === 'StructProperty'
        && top.sharedStruct
      ) {
        this.enqueueStructArrayElement(top);
      } else {
        this.enqueueArrayElement(top.element);
      }
    }
  }

  public next(): DecodeStepRow {
    while (this.canStep) {
      if (this._state.available === 0) {
        this.ensureIterContinuity();
      }
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
      this.advancePropertyIter(opcode);
      return row;
    }
    const top = this._frames[this._frames.length - 1];
    throw new Error(
      `next() stuck at 0x${this._reader.position.toString(16)}`
      + ` frames=${this._frames.length}`
      + (top ? ` top=${top.kind} rem=${top.remaining}` : ''),
    );
  }

  private currentFrame(): ParseFrame | undefined {
    return this._frames[this._frames.length - 1];
  }

  private isArrayLikeStructElementTerminator(
    frame: ArrayIterFrame | SetIterFrame,
    depthBefore: number,
  ): boolean {
    return frame.element.itemType === 'StructProperty'
      && frame.elementListDepth > 0
      && depthBefore === frame.elementListDepth
      && this._listDepth === frame.entryStartListDepth;
  }

  private isMapStructValueTerminator(frame: ParseFrame | undefined): frame is MapIterFrame {
    return frame !== undefined
      && frame.kind === 'mapIter'
      && frame.valueType === 'StructProperty'
      && frame.entryPhase !== 'key'
      && this._listDepth === frame.entryStartListDepth;
  }

  private isMapStructKeyTerminator(frame: ParseFrame | undefined): frame is MapIterFrame {
    return frame !== undefined
      && frame.kind === 'mapIter'
      && frame.keyType === 'StructProperty'
      && frame.entryPhase === 'key'
      && this._listDepth === frame.entryStartListDepth;
  }

  private shouldResumeParentListAfterNone(frame: ParseFrame | undefined): boolean {
    return this._listDepth > 0
      && !this.isMapStructValueTerminator(frame)
      && !this.isMapStructKeyTerminator(frame);
  }

  private completeIterEntry(
    frame: ParseFrame,
    enqueueNext: () => void,
    validateDone?: () => void,
  ): void {
    frame.remaining -= 1;
    if (frame.remaining > 0) {
      enqueueNext();
      return;
    }

    validateDone?.();
    this._frames.pop();
    this._state.close();
    this.enqueueParentTagName();
  }

  private assertStructArrayAtValueEnd(frame: ArrayIterFrame): void {
    if (!frame.sharedStruct) {
      return;
    }
    const expectedEnd = frame.sharedStruct.valueEnd;
    if (this._reader.position !== expectedEnd) {
      throw new Error(
        `Struct array ended at 0x${this._reader.position.toString(16)}`
        + ` but shared payload ends at 0x${expectedEnd.toString(16)}`,
      );
    }
  }

  private scheduleNextArrayLikeElement(frame: ArrayIterFrame | SetIterFrame): void {
    const isStructItem = frame.element.itemType === 'StructProperty';
    if (isStructItem && frame.kind === 'arrayIter' && frame.sharedStruct) {
      this.enqueueStructArrayElement(frame);
    } else if (isStructItem) {
      this._state.arrayEntry();
    } else {
      this.enqueueArrayElement(frame.element);
    }
  }

  private completeArrayElement(frame: ArrayIterFrame | SetIterFrame): void {
    this.completeIterEntry(
      frame,
      () => this.scheduleNextArrayLikeElement(frame),
      frame.kind === 'arrayIter' ? () => this.assertStructArrayAtValueEnd(frame) : undefined,
    );
  }

  /**
   * Post-step hook for `ArrayProperty`, `SetProperty`, and `MapProperty`
   * iteration. Runs after every opcode handler.
   */
  private advancePropertyIter(executed: Opcode): void {
    const top = this.currentFrame();
    if (!top) {
      return;
    }

    if (top.kind === 'arrayIter' || top.kind === 'setIter') {
      this.advanceArrayLikeIter(top, executed);
      return;
    }

    this.advanceMapIter(top, executed);
  }

  private advanceArrayLikeIter(frame: ArrayIterFrame | SetIterFrame, executed: Opcode): void {
    if (!this.isArrayLikeEntryComplete(frame, executed)) {
      return;
    }

    this.completeArrayElement(frame);
  }

  private isArrayLikeEntryComplete(
    frame: ArrayIterFrame | SetIterFrame,
    executed: Opcode,
  ): boolean {
    const isStructElement = frame.element.itemType === 'StructProperty';
    if (!isStructElement) {
      return isPrimitiveElementOpcode(executed);
    }
    if (executed === Opcode.PropNone) {
      this._noneDepthBefore = null;
      return false;
    }
    if (frame.kind === 'arrayIter' && frame.sharedStruct
      && isGenericStructType(frame.sharedStruct.structType)) {
      return false;
    }
    return executed === Opcode.Close
      && this._listDepth === frame.entryStartListDepth;
  }

  private advanceMapIter(frame: MapIterFrame, executed: Opcode): void {
    if (frame.keyType === 'StructProperty' && frame.entryPhase === 'key') {
      if (!this.isMapStructKeyBodyDone(frame, executed)) {
        return;
      }
      frame.entryPhase = 'value';
      this.enqueueMapValueOpcodes(frame, frame.currentEntryKey ?? '');
      return;
    }

    if (!this.isMapEntryComplete(frame, executed)) {
      if (executed === Opcode.PropNone) {
        this._noneDepthBefore = null;
      }
      return;
    }

    if (executed === Opcode.PropNone) {
      this._noneDepthBefore = null;
    }

    this.completeIterEntry(frame, () => this._state.mapEntry());
  }

  private isMapStructKeyBodyDone(frame: MapIterFrame, executed: Opcode): boolean {
    return executed === Opcode.PropNone
      && this._listDepth === frame.entryStartListDepth;
  }

  private isMapEntryComplete(frame: MapIterFrame, executed: Opcode): boolean {
    const fixedStructValueBoundary = frame.valueType === 'StructProperty'
      && mapStructValueType(frame.propName) !== undefined
      && executed === Opcode.Close;
    const isStructValueBoundary = frame.valueType === 'StructProperty'
      && mapStructValueType(frame.propName) === undefined
      && executed === Opcode.PropNone
      && this._noneDepthBefore === frame.entryStartListDepth + 1
      && this._listDepth === frame.entryStartListDepth;
    const isPrimitiveValueBoundary = frame.valueType !== 'StructProperty'
      && frame.keyType !== 'StructProperty'
      && isPrimitiveElementOpcode(executed);
    const isNestedContainerBoundary = (frame.valueType === 'ArrayProperty'
      || frame.valueType === 'MapProperty')
      && executed === Opcode.Close;

    return fixedStructValueBoundary
      || isStructValueBoundary
      || isPrimitiveValueBoundary
      || isNestedContainerBoundary;
  }

  private enqueueParentTagName(): void {
    if (this._reader.position < this._reader.size) {
      this._state.tagName();
      return;
    }
    if (this._listDepth === 0 && this._frames.length === 0) {
      const remaining = this._reader.size - this._reader.position;
      if (remaining > 0 && remaining <= 8) {
        this.enqueueTrailingFooter();
      }
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

  private handleFieldInt8(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const value = this._reader.readInt8();
    return this.readStep(Opcode.FieldInt8, '', value, start);
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

  /**
   * After the top-level body `None`, `SBS00.sav` has 8 opaque trailing bytes.
   * Surfaces them as a hex read without parsing as PropertyTags.
   */
  private enqueueTrailingFooter(): void {
    const remaining = this._reader.size - this._reader.position;
    if (remaining <= 0) {
      return;
    }
    const footerBytes = Math.min(remaining, 8);
    this._state.yieldName('trailingFooter');
    this._state.skipBytes(footerBytes);
  }

  private handleSkipBytes(): Extract<DecodeStepRow, { kind: 'read' }> {
    const count = this._state.uint32();
    const start = this._reader.position;
    const end = Math.min(start + count, this._reader.size);
    const view = this._reader._view;
    const bytes = new Uint8Array(view.buffer, view.byteOffset + start, end - start);
    const hex = toHex(bytes);
    this._reader.seek(end);
    return {
      kind: 'read',
      opcode: OPCODE_NAMES[Opcode.SkipBytes],
      args: String(count),
      value: hex,
      bytes: hex,
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
      const top = this.currentFrame();
      this._noneDepthBefore = this._listDepth;
      this._state.propNone();
      this._listDepth--;
      // If a parent property list is still open, resume it by enqueuing
      // another TagName *after* the PropNone has popped the inner container.
      // Exception: when the None terminates a MapProperty entry's
      // StructProperty value, the next wire bytes are the next entry's KEY
      // (not a property tag header). `advancePropertyIter` on the upcoming
      // PropNone will chain the next `MapEntry` scheduler or tear down the
      // map; pushing a parent TagName here would desync on the key bytes.
      if (
        top !== undefined
        && (top.kind === 'arrayIter' || top.kind === 'setIter')
        && this.isArrayLikeStructElementTerminator(top, this._noneDepthBefore)
      ) {
        this.completeArrayElement(top);
      } else if (this.shouldResumeParentListAfterNone(top)) {
        this._state.tagName();
      } else if (
        this._listDepth === 0
        && this._frames.length === 0
        && this._reader.size - this._reader.position <= 8
      ) {
        this.enqueueTrailingFooter();
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
        this.enqueueStructBody(propName, this._tag.structType, true);
        return;
      case 'ArrayProperty':
        this._state.yieldName(propName);
        this._state.arrayCount();
        return;
      case 'MapProperty':
        this._state.yieldName(propName);
        this._state.mapCount();
        return;
      case 'SetProperty':
        this._state.yieldName(propName);
        this._state.setCount();
        return;
      case 'TextProperty':
        this._state.yieldName(propName);
        this._state.textPropertyValue();
        return;
      case 'SELostProperty':
        this._state.yieldName(propName);
        this._state.openStruct(propName);
        this._listDepth++;
        this._state.tagName();
        return;
      default:
        this._state.yieldName(propName);
        this._state.skipBytes(size);
        break;
    }

    this._state.tagName();
  }

  /**
   * StructProperty value body. When `resumeParent` is true (top-level tag),
   * fixed-layout branches tail-enqueue `TagName`; generic nested lists rely
   * on the terminating `None` to resume the parent list.
   */
  private enqueueStructBody(
    propName: string,
    structType: string,
    resumeParent: boolean,
  ): void {
    const floatFields = floatStructFields(structType);
    if (floatFields !== undefined) {
      this.enqueueFloatStruct(propName, floatFields, resumeParent);
      return;
    }

    const scalarOpcode = scalarStructOpcode(structType);
    if (scalarOpcode !== undefined) {
      this.enqueueScalarStruct(propName, scalarOpcode, resumeParent);
      return;
    }

    this._state.openStruct(propName);
    this._listDepth++;
    this._state.tagName();
  }

  private enqueueFloatStruct(
    propName: string,
    fields: readonly string[],
    resumeParent: boolean,
  ): void {
    this._state.openStruct(propName);
    for (const field of fields) {
      this._state.yieldName(field);
      this._state.fieldFloat32();
    }
    this._state.close();
    if (resumeParent) this._state.tagName();
  }

  private enqueueScalarStruct(
    propName: string,
    opcode: Opcode,
    resumeParent: boolean,
  ): void {
    if (resumeParent) {
      this.enqueueReadOpcode(opcode);
      this._state.tagName();
      return;
    }

    this._state.openStruct(propName);
    this._state.yieldName(propName);
    this.enqueueReadOpcode(opcode);
    this._state.close();
  }

  private enqueueReadOpcode(opcode: Opcode): void {
    switch (opcode) {
      case Opcode.FieldGuid:
        this._state.fieldGuid();
        return;
      case Opcode.FieldInt64:
        this._state.fieldInt64();
        return;
      default:
        throw new Error(`Unsupported struct scalar opcode: ${OPCODE_NAMES[opcode]}`);
    }
  }

  private handleTextPropertyValue(): Extract<DecodeStepRow, { kind: 'read' }> {
    const start = this._reader.position;
    const size = this._tag.size;
    const flags = this._reader.readByte();
    const hasHistory = (flags & 0x01) !== 0;
    const hasCultureInvariant = (flags & 0x04) !== 0;

    if (hasHistory) {
      this._reader.readByte();
    }
    if (hasCultureInvariant) {
      this._reader.readString();
      this._reader.readString();
    } else {
      this._reader.readString();
      this._reader.readString();
    }
    const text = this._reader.readString();

    const consumed = this._reader.position - start;
    const remaining = size - consumed;
    if (remaining > 0) {
      const end = Math.min(this._reader.position + remaining, this._reader.size);
      this._reader.seek(end);
    } else if (remaining < 0) {
      throw new Error(
        `TextProperty over-read by ${-remaining} bytes at offset 0x${start.toString(16)}`,
      );
    }

    this._state.tagName();
    return this.readStep(Opcode.FieldString, '', text, start);
  }

  /**
   * Reads the leading `Int32 ItemCount` of an `ArrayProperty` Value and
   * opens the array container. Struct arrays consume one shared descriptor
   * before their count-delimited element bodies; primitives enqueue element reads.
   */
  private handleArrayCount(): DecodeStepRow {
    const start = this._reader.position;
    const n = this._reader.readInt32();
    this._tag.itemCount = n;
    const row = this.tagHeaderStep('itemCount', n, start);

    const propName = this._tag.name;
    const itemType = this._tag.itemType;
    const valueEnd = start + this._tag.size;

    this._state.openArray(propName);
    if (n === 0) {
      this._state.close();
      const valueRemainder = this._tag.size - 4;
      if (valueRemainder > 0) {
        this._reader.seek(this._reader.position + valueRemainder);
      }
      this._state.tagName();
    } else {
      const element: ArrayIterElement = { itemType };
      const frame: ArrayIterFrame = {
        kind: 'arrayIter',
        remaining: n,
        totalCount: n,
        element,
        entryStartListDepth: this._listDepth,
        elementListDepth: 0,
      };
      this._frames.push(frame);
      if (itemType === 'StructProperty') {
        frame.sharedStruct = readSharedStructArrayDescriptor(this._reader, valueEnd);
        element.structType = frame.sharedStruct.structType;
        this.enqueueStructArrayElement(frame);
      } else {
        this.enqueueArrayElement(element);
      }
    }

    return row;
  }

  private enqueueStructArrayElement(frame: ArrayIterFrame): void {
    const descriptor = frame.sharedStruct;
    if (!descriptor) {
      throw new Error('Struct array element requested before shared descriptor was read');
    }

    if (isGenericStructType(descriptor.structType)) {
      this._state.openStruct('');
      this._listDepth++;
      frame.elementListDepth = this._listDepth;
      this._state.tagName();
      return;
    }

    this.enqueueStructBody('', descriptor.structType, false);
    frame.elementListDepth = this._listDepth;
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
      case 'ArrayProperty':
        this.enqueueNestedArrayElement();
        return;
      case 'MapProperty':
        this.enqueueNestedMapElement();
        return;
      default:
        throw new Error(`Unsupported ArrayProperty ItemType: ${element.itemType}`);
    }
  }

  /**
   * Nested `ArrayProperty` item (no per-element tag header): ItemCount Int32
   * then items per the outer array's metadata is unavailable for the inner
   * layer, so we open an anonymous array container and decode primitive
   * FString-shaped items only when the nested count is zero we close immediately.
   */
  private enqueueNestedArrayElement(): void {
    this._state.openArray('');
    this._state.arrayCount();
  }

  /**
   * Nested `MapProperty` item (no per-element tag header): reuse MapCount
   * with key/value types taken from the parent array tag's item metadata.
   * The outer `ArrayProperty` ItemType is `MapProperty`; key/value types
   * are not on the wire per element — they must be carried on the frame.
   */
  private enqueueNestedMapElement(): void {
    this._state.openMap('');
    this._state.mapCount();
  }

  /** Scheduler for one legacy `SetProperty<StructProperty>` element. */
  private handleArrayEntry(): DecodeStepRow {
    const top = this._frames[this._frames.length - 1];
    if (!top || top.kind !== 'setIter') {
      throw new Error('ArrayEntry without setIter frame');
    }

    const entryStart = this._reader.position;
    const innerName = this._reader.readString();
    const innerType = this._reader.readString();
    if (innerType !== 'StructProperty') {
      this._reader.seek(entryStart);
      this._state.tagName();
      return this.tagHeaderStep('innerName', innerName, entryStart);
    }
    this._reader.readInt32();
    this._reader.readInt32();
    const structType = this._reader.readString();
    this._reader.readGUID();
    const guidFlag = this._reader.readByte();
    if (guidFlag === 1) {
      this._reader.readGUID();
    }

    top.element.structType = structType;
    if (isGenericStructType(structType)) {
      this._state.openStruct(innerName);
      this._listDepth++;
      top.elementListDepth = this._listDepth;
      this._state.tagName();
    } else {
      this.enqueueStructBody(innerName, structType, false);
      top.elementListDepth = this._listDepth;
    }

    return this.tagHeaderStep('innerName', innerName, entryStart);
  }

  /**
   * Reads SetProperty value prefix (padding + item count) and opens the set
   * container. Primitive items reuse the array element opcode set.
   */
  private handleSetCount(): DecodeStepRow {
    const start = this._reader.position;
    const padding = this._reader.readInt32();
    if (padding !== 0) {
      console.warn(
        `SetProperty padding expected 0, got ${padding} at offset 0x${start.toString(16)}`,
      );
    }
    const n = this._reader.readInt32();
    this._tag.itemCount = n;

    const propName = this._tag.name;
    const itemType = this._tag.itemType;

    this._state.openArray(propName);
    if (n === 0) {
      this._state.close();
      this._state.tagName();
    } else {
      const element: ArrayIterElement = { itemType };
      this._frames.push({
        kind: 'setIter',
        remaining: n,
        totalCount: n,
        element,
        entryStartListDepth: this._listDepth,
        elementListDepth: 0,
      });
      if (itemType === 'StructProperty') {
        this._state.arrayEntry();
      } else {
        this.enqueueArrayElement(element);
      }
    }

    return this.tagHeaderStep('itemCount', n, start);
  }

  /**
   * Reads the leading 4-byte padding + Int32 `EntryCount` of a
   * `MapProperty` Value and opens the map container. Either pushes a
   * `mapIter` frame and one `MapEntry` opcode (entries > 0) or
   * short-circuits to `close + tagName` (empty map). Emits a
   * `tagHeader{field:'entryCount'}` row so the byte log surfaces the
   * count inline with other tag-header rows.
   *
   * The 4-byte padding is observed as `00 00 00 00` in every `SBS00.sav`
   * map; a non-zero value is surfaced via `console.warn` but not treated
   * as fatal.
   */
  private handleMapCount(): DecodeStepRow {
    const start = this._reader.position;
    const padding = this._reader.readInt32();
    if (padding !== 0) {
      console.warn(
        `MapProperty padding expected 0, got ${padding} at offset 0x${start.toString(16)}`,
      );
    }
    const n = this._reader.readInt32();
    this._tag.entryCount = n;

    const propName = this._tag.name;
    const keyType = this._tag.keyType;
    const valueType = this._tag.valueType;

    this._state.openMap(propName);
    if (n === 0) {
      this._state.close();
      this._state.tagName();
    } else {
      this._frames.push({
        kind: 'mapIter',
        remaining: n,
        totalCount: n,
        keyType,
        valueType,
        propName,
        entryStartListDepth: this._listDepth,
      });
      this._state.mapEntry();
    }

    return this.tagHeaderStep('entryCount', n, start);
  }

  /**
   * Scheduler opcode for one `MapProperty` entry. Reads the key from the
   * wire per the active `mapIter` frame's `keyType`, emits a
   * `tagHeader{field:'mapKey'}` row carrying the key bytes (so the byte
   * log accounts for the key's wire consumption), then pushes the
   * value-reading opcodes:
   *
   * - primitive ValueType: `yieldName(keyStr) + <primitive read>`
   * - `StructProperty` value: `openStruct(keyStr) + _listDepth++ + tagName`
   *
   * The next entry (or map tear-down) is queued by `advancePropertyIter`
   * after the value boundary opcode fires.
   */
  private handleMapEntry(): DecodeStepRow {
    const top = this._frames[this._frames.length - 1];
    if (!top || top.kind !== 'mapIter') {
      throw new Error('MapEntry without mapIter frame');
    }

    const keyStart = this._reader.position;
    const keyStr = top.keyType === 'StructProperty'
      ? readMapStructKeyHeader(this._reader, keyStart)
      : readMapKey(this._reader, top.keyType, keyStart);

    if (top.keyType === 'StructProperty') {
      top.entryPhase = 'key';
      top.currentEntryKey = keyStr;
      this._state.openStruct(keyStr);
      this._listDepth++;
      this._state.tagName();
      return this.tagHeaderStep('mapKey', keyStr, keyStart);
    }

    this.enqueueMapValueOpcodes(top, keyStr);
    return this.tagHeaderStep('mapKey', keyStr, keyStart);
  }

  private enqueueMapValueOpcodes(top: MapIterFrame, keyStr: string): void {
    switch (top.valueType) {
      case 'StructProperty': {
        const structType = mapStructValueType(top.propName);
        if (structType !== undefined) {
          this.enqueueStructBody(keyStr, structType, false);
          break;
        }
        this._state.openStruct(keyStr);
        this._listDepth++;
        this._state.tagName();
        break;
      }
      case 'IntProperty':
      case 'UInt32Property':
        this._state.yieldName(keyStr);
        this._state.fixInt32(1);
        break;
      case 'Int64Property':
        this._state.yieldName(keyStr);
        this._state.fieldInt64();
        break;
      case 'FloatProperty':
        this._state.yieldName(keyStr);
        this._state.fieldFloat32();
        break;
      case 'DoubleProperty':
        this._state.yieldName(keyStr);
        this._state.fieldDouble64();
        break;
      case 'StrProperty':
      case 'NameProperty':
        this._state.yieldName(keyStr);
        this._state.fieldString();
        break;
      case 'BoolProperty':
      case 'ByteProperty':
        this._state.yieldName(keyStr);
        this._state.fieldByte();
        break;
      case 'EnumProperty':
        this._state.yieldName(keyStr);
        this._state.fieldString();
        break;
      case 'ArrayProperty':
        this._state.yieldName(keyStr);
        this._state.arrayCount();
        break;
      case 'MapProperty':
        this._state.yieldName(keyStr);
        this._state.mapCount();
        break;
      case 'Int8Property':
        this._state.yieldName(keyStr);
        this._state.fieldInt8();
        break;
      default:
        throw new Error(
          `Unsupported MapProperty ValueType: ${top.valueType}`,
        );
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
