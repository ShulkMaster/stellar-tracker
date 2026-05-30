import { BinaryWriter } from 'tracker/binaryWriter/BinaryWriter';

const STRUCT_GUID_ZERO = '00000000000000000000000000000000';

export const EXPECTED_QUEST_ALIASES = [
  'CQ_Records_Passcode_DED20_EnvS_211',
  'CQ_Records_Passcode_WLA_10_EnvS_158',
  'CQ_Records_Passcode_WLA_30_EnvS_070',
  'CQ_Records_Passcode_WLA_40_EnvS_036',
] as const;

/** Build a minimal body for one ProgressQuestList struct element: QuestAlias + None. */
function buildQuestElementBody(alias: string): Uint8Array {
  const w = new BinaryWriter();
  w.writeString('QuestAlias');
  w.writeString('NameProperty');
  const sizePos = w.position;
  w.writeInt32(0); // placeholder
  w.writeInt32(0);
  w.writeByte(0); // hasGuid
  const valStart = w.position;
  w.writeString(alias);
  const valEnd = w.position;
  w.seek(sizePos);
  w.writeInt32(valEnd - valStart);
  w.seek(valEnd);
  w.writeString('None');
  return w.toUint8Array();
}

function buildProgressQuestTagHeader(payloadLength: number): Uint8Array {
  const w = new BinaryWriter();
  w.writeString('ProgressQuestList');
  w.writeString('ArrayProperty');
  w.writeInt32(payloadLength);
  w.writeInt32(0);
  w.writeString('StructProperty');
  w.writeByte(0);
  return w.toUint8Array();
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function buildCountBytes(count: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, count, true);
  return b;
}

function buildSharedStructDescriptor(valueSize: number): Uint8Array {
  const w = new BinaryWriter();
  w.writeString('ProgressQuestList');
  w.writeString('StructProperty');
  w.writeInt32(valueSize);
  w.writeInt32(0);
  w.writeString('SBSaveGameData_QuestObject');
  w.writeGUID(STRUCT_GUID_ZERO);
  w.writeByte(0);
  return w.toUint8Array();
}

function buildPayload(count: number, elements: Uint8Array[]): Uint8Array {
  const bodyLength = elements.reduce((sum, element) => sum + element.length, 0);
  return concatBytes([
    buildCountBytes(count),
    buildSharedStructDescriptor(bodyLength),
    ...elements,
  ]);
}

function buildFixture(count: number, elements: Uint8Array[]): Uint8Array {
  const payload = buildPayload(count, elements);
  const none = new BinaryWriter();
  none.writeString('None');
  return concatBytes([buildProgressQuestTagHeader(payload.length), payload, none.toUint8Array()]);
}

/** One element using the first alias. */
export const PROGRESS_QUEST_ONE_ELEMENT_FIXTURE = buildFixture(1, [
  buildQuestElementBody(EXPECTED_QUEST_ALIASES[0]),
]);

/** Two elements. */
export const PROGRESS_QUEST_TWO_ELEMENT_FIXTURE = buildFixture(2, [
  buildQuestElementBody(EXPECTED_QUEST_ALIASES[0]),
  buildQuestElementBody(EXPECTED_QUEST_ALIASES[1]),
]);

/** Four elements covering the original boundary case. */
export const PROGRESS_QUEST_FOUR_ELEMENT_FIXTURE = buildFixture(4, [
  buildQuestElementBody(EXPECTED_QUEST_ALIASES[0]),
  buildQuestElementBody(EXPECTED_QUEST_ALIASES[1]),
  buildQuestElementBody(EXPECTED_QUEST_ALIASES[2]),
  buildQuestElementBody(EXPECTED_QUEST_ALIASES[3]),
]);
