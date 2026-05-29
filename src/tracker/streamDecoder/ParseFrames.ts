/**
 * Decoder-side frame stack.
 *
 * Frames are needed only for *iterating* multi-entry containers in the body
 * (arrays and maps). Once a frame is on top, the post-step hook
 * `StreamDecoder.advancePropertyIter` re-enqueues the next element opcode
 * after each completed entry and tears the container down when the count
 * reaches zero.
 *
 * Everything else (property tags, nested struct property-lists, the
 * GVAS-header `customVersions` block via the `CustomVersionEntry`
 * scheduler opcode, ...) is opcode-driven and frame-free.
 *
 * Two variants today:
 *
 * - `arrayIter`: body `ArrayProperty` whose `ItemType` is a primitive or
 *   FString. Carries the item type plus the remaining count.
 * - `mapIter`: body `MapProperty`. Carries key/value types, remaining
 *   count, the property name (for the assembler) and the `_listDepth`
 *   snapshot at frame creation. The snapshot is what lets the `None` gate
 *   in `handleTagName` know when a struct-value entry has ended (the
 *   inner `None` decrements `_listDepth` back to this snapshot).
 *
 * `ArrayProperty<StructProperty>` body items still fall back to
 * `SkipBytes` in `enqueueValueSequence` and so do not push a frame.
 * Struct-keyed maps are out of scope (no occurrence in `SBS00.sav`).
 */
export type ArrayIterElement = {
  itemType: string;
};

export type ArrayIterFrame = {
  kind: 'arrayIter';
  /** Elements still to consume. Decremented after each completed element. */
  remaining: number;
  /** Pinned at frame creation; reserved for future per-element decoration. */
  totalCount: number;
  element: ArrayIterElement;
};

export type MapIterFrame = {
  kind: 'mapIter';
  /** Entries still to consume. Decremented after each completed entry. */
  remaining: number;
  /** Pinned at frame creation; reserved for future per-entry decoration. */
  totalCount: number;
  /** GVAS KeyType FString from the tag metadata. */
  keyType: string;
  /** GVAS ValueType FString from the tag metadata. */
  valueType: string;
  /** Property name — for diagnostics; the assembler keys via the `openMap` row. */
  propName: string;
  /**
   * Snapshot of `_listDepth` at frame creation. A struct-valued entry
   * temporarily pushes `_listDepth` up by 1 (its inner property list); the
   * inner terminating `None` brings it back to this value. `handleTagName`
   * uses the match to suppress the parent-`TagName` re-enqueue (otherwise
   * the next entry's key bytes would be misread as a property tag name),
   * and `advancePropertyIter` uses the match to recognize the entry's
   * `PropNone` as the end-of-entry boundary.
   */
  entryStartListDepth: number;
};

export type ParseFrame = ArrayIterFrame | MapIterFrame;
