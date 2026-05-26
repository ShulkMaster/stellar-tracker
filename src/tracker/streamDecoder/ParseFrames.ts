/**
 * Decoder-side frame stack.
 *
 * A frame is only needed for *iterating* a body-array Value: once an
 * `arrayIter` frame is on top, the post-step hook in `StreamDecoder.next()`
 * re-enqueues the next element opcode after each completed element and tears
 * the array down on completion. Everything else (property tags, nested
 * struct property-lists, the GVAS header's `customVersions` block via the
 * `CustomVersionEntry` scheduler opcode, ...) is opcode-driven and
 * frame-free.
 *
 * Body struct-array items (`ArrayProperty` of `StructProperty`) still fall
 * back to `SkipBytes` in `enqueueValueSequence` and so do not push a frame
 * either. When implemented they will likely need a second element variant
 * here, but for now the type is intentionally flat (no shape discriminator).
 */
export type ArrayIterElement = {
  itemType: string;
};

export type ParseFrame = {
  kind: 'arrayIter';
  /** Elements still to consume. Decremented after each completed element. */
  remaining: number;
  /** Pinned at frame creation; reserved for future per-element decoration. */
  totalCount: number;
  element: ArrayIterElement;
};
