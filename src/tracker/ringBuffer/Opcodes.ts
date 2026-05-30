export const enum Opcode {
  /**
   * FixAscii is a fixed-length ASCII string opcode.
   * the next uint16 is the length of the string.
   */
  FixAscii = 0,
  /**
   * FixInt32 is a fixed-length 32-bit integer.
   * the next uint16 is the number of 32-bit integers to read.
   */
  FixInt32 = 1,
  /**
   * FixUint16 is a fixed-length 16-bit unsigned integer.
   * the next uint16 is the number of 16-bit integers to read.
   */
  FixUint16 = 2,
  /**
   * FieldString reads an Unreal FString from the file.
   */
  FieldString = 3,
  /** Announces the property name for the next read step. */
  YieldName = 4,
  /** Opens a nested struct container on the assembler stack. */
  OpenStruct = 5,
  /** Opens a nested array container on the assembler stack. */
  OpenArray = 6,
  /** Opens a nested map container on the assembler stack. */
  OpenMap = 7,
  /** Closes the innermost struct/array/map and pops the assembler stack. */
  Close = 8,
  /** GVAS None property tag — pops the assembler stack. */
  PropNone = 9,
  /** Reads a 16-byte Unreal GUID from the file. */
  FieldGuid = 10,

  /** Reads an Int64 value from the file (8 bytes, little-endian). */
  FieldInt64 = 11,
  /** Reads a Float32 value from the file (4 bytes, little-endian). */
  FieldFloat32 = 12,
  /** Reads a Float64 value from the file (8 bytes, little-endian). */
  FieldDouble64 = 13,
  /** Reads a single byte value from the file. */
  FieldByte = 14,
  /** Emits the cached BoolProperty value (no wire bytes consumed). */
  ValBool = 15,

  /** Conditionally enqueues OpenStruct('body') + TagName when bytes remain. */
  EnterBody = 16,
  /** Advances the reader by N bytes (uint32 arg). Emits a placeholder read row. */
  SkipBytes = 17,

  /** GVAS property tag header — Name FString. None ends the current list. */
  TagName = 18,
  /** GVAS property tag header — Type FString. */
  TagType = 19,
  /** GVAS property tag header — Size Int32. */
  TagSize = 20,
  /** GVAS property tag header — ArrayIndex Int32. */
  TagArrayIndex = 21,
  /** GVAS property tag — HasPropertyGuid flag byte. */
  TagGuidFlag = 22,
  /** GVAS property tag — optional PropertyGuid (when flag == 1). */
  TagPropGuid = 23,
  /** StructProperty metadata — inner struct type FString. */
  TagStructType = 24,
  /** StructProperty metadata — inner struct GUID (16 bytes). */
  TagStructGuid = 25,
  /** BoolProperty metadata — BoolVal byte. */
  TagBoolVal = 26,
  /** ByteProperty / EnumProperty metadata — enum name FString. */
  TagEnumName = 27,
  /** ArrayProperty / SetProperty metadata — item type FString. */
  TagItemType = 28,
  /** MapProperty metadata — key type FString. */
  TagKeyType = 29,
  /** MapProperty metadata — value type FString. */
  TagValueType = 30,
  /**
   * ArrayProperty value-prefix — reads Int32 ItemCount, then opens the array
   * container and either skips an empty payload (count == 0) or pushes an
   * `arrayIter` frame and enqueues the first element opcode.
   */
  ArrayCount = 31,
  /**
   * GVAS header-only scheduler opcode. Pushes the six sub-opcodes that
   * materialize one `{ guid: GUID(16), version: Int32(4) }` custom-version
   * entry (openStruct + yieldName/FieldGuid + yieldName/FixInt32 + close)
   * with the current entry index stamped onto each emitted row.
   *
   * The handler returns `null`; `StreamDecoder.next()` drains scheduler
   * opcodes transparently so the row sequence observed by callers is the
   * six sub-rows per entry — no extra row for the scheduler itself.
   */
  CustomVersionEntry = 32,

  /**
   * MapProperty value-prefix opcode. Reads the 4-byte unused/padding
   * field then the `EntryCount` Int32, opens the map container, and
   * either pushes a `mapIter` frame + one `MapEntry` opcode (entries > 0)
   * or short-circuits to `close + tagName` (empty map). Emits a
   * `tagHeader{field:'entryCount'}` row so the byte log surfaces the
   * count inline with other tag-header rows.
   */
  MapCount = 33,

  /**
   * MapProperty per-entry scheduler. Reads one key per the active
   * `mapIter` frame's `keyType`, emits a `tagHeader{field:'mapKey'}`
   * row carrying the key bytes, then pushes the value-reading
   * opcode(s) per `valueType`:
   *
   * - primitive ValueType: `yieldName(keyStr) + <primitive read>`
   * - `StructProperty` value: `openStruct(keyStr) + _listDepth++ + tagName`
   *
   * The next entry (or the map's tear-down) is queued by the
   * `advancePropertyIter` post-step hook in `StreamDecoder.next()`.
   */
  MapEntry = 34,

  /** Reads a signed Int8 value from the file (1 byte). */
  FieldInt8 = 35,

  /**
   * Legacy SetProperty<StructProperty> per-element scheduler. Real
   * ArrayProperty<StructProperty> values use one shared descriptor after
   * ItemCount and do not enqueue this per element.
   */
  ArrayEntry = 36,

  /**
   * SetProperty value-prefix — reads 4-byte padding + Int32 ItemCount,
   * opens the set container, and either short-circuits (empty) or pushes
   * a `setIter` frame and enqueues the first element opcode.
   */
  SetCount = 37,

  /**
   * TextProperty value: flags byte, optional history type, namespace,
   * key FString, then source string FString.
   */
  TextPropertyValue = 38,
}

export const OPCODE_NAMES: Record<Opcode, string> = {
  [Opcode.FixAscii]: 'FixAscii',
  [Opcode.FixInt32]: 'FixInt32',
  [Opcode.FixUint16]: 'FixUint16',
  [Opcode.FieldString]: 'FieldString',
  [Opcode.YieldName]: 'YieldName',
  [Opcode.OpenStruct]: 'OpenStruct',
  [Opcode.OpenArray]: 'OpenArray',
  [Opcode.OpenMap]: 'OpenMap',
  [Opcode.Close]: 'Close',
  [Opcode.PropNone]: 'PropNone',
  [Opcode.FieldGuid]: 'FieldGuid',
  [Opcode.FieldInt64]: 'FieldInt64',
  [Opcode.FieldFloat32]: 'FieldFloat32',
  [Opcode.FieldDouble64]: 'FieldDouble64',
  [Opcode.FieldByte]: 'FieldByte',
  [Opcode.ValBool]: 'ValBool',
  [Opcode.EnterBody]: 'EnterBody',
  [Opcode.SkipBytes]: 'SkipBytes',
  [Opcode.TagName]: 'TagName',
  [Opcode.TagType]: 'TagType',
  [Opcode.TagSize]: 'TagSize',
  [Opcode.TagArrayIndex]: 'TagArrayIndex',
  [Opcode.TagGuidFlag]: 'TagGuidFlag',
  [Opcode.TagPropGuid]: 'TagPropGuid',
  [Opcode.TagStructType]: 'TagStructType',
  [Opcode.TagStructGuid]: 'TagStructGuid',
  [Opcode.TagBoolVal]: 'TagBoolVal',
  [Opcode.TagEnumName]: 'TagEnumName',
  [Opcode.TagItemType]: 'TagItemType',
  [Opcode.TagKeyType]: 'TagKeyType',
  [Opcode.TagValueType]: 'TagValueType',
  [Opcode.ArrayCount]: 'ArrayCount',
  [Opcode.CustomVersionEntry]: 'CustomVersionEntry',
  [Opcode.MapCount]: 'MapCount',
  [Opcode.MapEntry]: 'MapEntry',
  [Opcode.FieldInt8]: 'FieldInt8',
  [Opcode.ArrayEntry]: 'ArrayEntry',
  [Opcode.SetCount]: 'SetCount',
  [Opcode.TextPropertyValue]: 'TextPropertyValue',
};
