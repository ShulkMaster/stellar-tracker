/**
 * Decoder-side frame stack: the body's property-tag loop is opcode-driven and
 * does not need frames. The only remaining frame use-case is the header's
 * `customVersions` array iteration, whose item layout (GUID + Int32) is
 * hardcoded inside `StreamDecoder` rather than looked up from a schema.
 */
export type ParseFrame = {
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
};
