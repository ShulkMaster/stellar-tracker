import type { CustomVersion } from 'types/safeFile';

/**
 * First 10 custom version entries from SBS00.sav. The real file has 56;
 * 10 is plenty to exercise the array/struct decode path without burying
 * the test fixtures under 56 GUID literals.
 */
export const EXPECTED_CUSTOM_VERSIONS: CustomVersion[] = [
  { guid: 'FCF57AFA50764283B9A9E658FFA02D32', version: 68 },
  { guid: 'A7820CFB20A743598C542C149623CF50', version: 6 },
  { guid: 'C52D92BED4A6A49C11E593249A6C11E5', version: 2 },
  { guid: '11310AED2E554D61AF679AA3C5A1082C', version: 17 },
  { guid: '24BB7AF356464F831F2F2DC249AD96FF', version: 5 },
  { guid: '76A52329092345B598AED841CF2F6AD8', version: 5 },
  { guid: '5FBC690755C840AE8E67F1845EFFF13F', version: 1 },
  { guid: 'FB26E4121F154B4D9372550A961D2F70', version: 3 },
  { guid: '82E77C4E332343A5B46B13C597310DF3', version: 0 },
  { guid: '9C54D522A8264FBE9421074661B482D0', version: 38 },
];

/** Bytes per custom version entry: 16-byte GUID + 4-byte Int32 version. */
export const CUSTOM_VERSION_ENTRY_BYTES = 20;
