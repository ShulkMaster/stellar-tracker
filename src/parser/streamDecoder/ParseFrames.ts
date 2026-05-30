/**
 * Decoder-side frame stack.
 *
 * Frames are needed only for *iterating* multi-entry containers in the body
 * (arrays, sets, and maps). Once a frame is on top, the post-step hook
 * `StreamDecoder.advancePropertyIter` re-enqueues the next element opcode
 * after each completed entry and tears the container down when the count
 * reaches zero.
 *
 * Everything else (property tags, nested struct property-lists, the
 * GVAS-header `customVersions` block via the `CustomVersionEntry`
 * scheduler opcode, ...) is opcode-driven and frame-free.
 *
 * Three variants today:
 *
 * - `arrayIter`: body `ArrayProperty`. Carries the item type, remaining
 *   count, and for struct items the one shared struct descriptor that appears
 *   before the count-delimited element bodies.
 * - `setIter`: body `SetProperty`. Same iteration model as primitive arrays.
 * - `mapIter`: body `MapProperty`. Carries key/value types, remaining
 *   count, the property name (for the assembler) and the `_listDepth`
 *   snapshot at frame creation.
 */
export type ArrayIterElement = {
  itemType: string;
  /** Populated for `StructProperty` array elements after their descriptor is read. */
  structType?: string;
};

/** Shared `ArrayProperty<StructProperty>` descriptor consumed after ItemCount. */
export type SharedStructArrayDescriptor = {
  name: string;
  structType: string;
  valueEnd: number;
};

export type ArrayIterFrame = {
  kind: 'arrayIter';
  /** Elements still to consume. Decremented after each completed element. */
  remaining: number;
  /** Pinned at frame creation; reserved for future per-element decoration. */
  totalCount: number;
  element: ArrayIterElement;
  /** `_listDepth` of the element's property list after `openStruct` (0 until set). */
  elementListDepth: number;
  entryStartListDepth: number;
  /** Populated for `ArrayProperty<StructProperty>` after the shared descriptor is read. */
  sharedStruct?: SharedStructArrayDescriptor;
};

export type SetIterFrame = {
  kind: 'setIter';
  remaining: number;
  totalCount: number;
  element: ArrayIterElement;
  elementListDepth: number;
  entryStartListDepth: number;
};

export type MapIterFrame = {
  kind: 'mapIter';
  remaining: number;
  totalCount: number;
  keyType: string;
  valueType: string;
  propName: string;
  entryStartListDepth: number;
  /** When `keyType` is `StructProperty`, tracks key vs value decode phase. */
  entryPhase?: 'key' | 'value';
  /** Struct type FString from the key InnerTag (struct-keyed maps only). */
  structKeyType?: string;
  /** Map key string for the in-flight entry (struct-key phase stores it here). */
  currentEntryKey?: string;
};

export type ParseFrame = ArrayIterFrame | SetIterFrame | MapIterFrame;
