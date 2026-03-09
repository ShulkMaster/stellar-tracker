import { StreamDecoder } from './StreamDecoder';
import { BinaryReader } from '../binaryReader/BinaryReader';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// todo update this test for a custom binary generation
describe('StreamDecoder', () => {
  it('Should decode header of SBS00.sav', async () => {
    const filePath = path.resolve(__dirname, '../../../public/SBS00.sav');
    const buffer = await readFile(filePath);
    const reader = new BinaryReader(new Uint8Array(buffer));
    const decoder = new StreamDecoder(reader);
    const header = decoder.decodeHeader();

    expect(header).toMatchObject({
      stelarHeader: 'EVAS',
      stelarVersion: 1,
      unrealHeader: 'GVAS',
      unrealVersion: 2,
      packageVersion: 525,
      majorVersion: 4,
      minorVersion: 26,
      patchVersion: 2,
      changelistVersion: 0,
      engineBranch: '++UE4+Release-4.26',
      customVersionFormat: 3,
      customVersionCount: 56,
      saveClassName: '/Script/SB.SBSaveGame',
    });

    expect(header.customVersions).toHaveLength(56);
    expect(header.customVersions[0]).toEqual({ guid: 'FCF57AFA50764283B9A9E658FFA02D32', version: 68 });
    expect(header.customVersions[1]).toEqual({ guid: 'A7820CFB20A743598C542C149623CF50', version: 6 });
    expect(header.customVersions[2]).toEqual({ guid: 'C52D92BED4A6A49C11E593249A6C11E5', version: 2 });
  });
});
