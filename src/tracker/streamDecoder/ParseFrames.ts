/**
 * Decoder-side frame stack. Most of the parser is opcode-driven and does not
 * need frames; the two exceptions are:
 *
 * - `customVersions` — header-only iteration whose item layout (GUID + Int32)
 *   is hardcoded inside `StreamDecoder` rather than looked up from a schema.
 * - `arrayIter` — body-side iteration over an `ArrayProperty` Value, holding
 *   the element type and remaining-element counter for the post-step hook in
 *   `next()`. Carries no type-specific layout (`itemType` is read from the
 *   wire; `remaining` is just a counter).
 */
export type ParseFrame =
  | {
      kind: 'customVersions';
      count: number;
      index: number;
      /**
       * Sub-step within a single element iteration.
       *   open       — emit OpenStruct
       *   guidName   — emit YieldName 'guid'
       *   guid       — read FieldGuid value
       *   versionName — emit YieldName 'version'
       *   version    — read FixInt32 value
       *   close      — emit Close, advance index
       */
      phase:
        | 'open'
        | 'guidName'
        | 'guid'
        | 'versionName'
        | 'version'
        | 'close';
    }
  | {
      kind: 'arrayIter';
      itemType: string;
      remaining: number;
    };
