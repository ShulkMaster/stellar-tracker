export type CustomVersion = {
  guid: string;
  version: number;
}

export type SaveHeader = {
  stelarHeader: string;
  stelarVersion: number;
  unrealHeader: string;
  unrealVersion: number;
  packageVersion: number;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  changelistVersion: number;
  engineBranch: string;
  customVersionFormat: number;
  customVersionCount: number;
  customVersions: CustomVersion[];
  saveClassName: string;
}

export const enum ProType {
  Int64Property = 'Int64Property',
  MapProperty = 'MapProperty',
}

export type PropertyParseContext = {
  propName: string;
  propType: string;
  byteSize: number;
  arrayIndex: number;
  guidTag: string | undefined;
}

export type Int64Prop = {
  name: string;
  type: ProType.Int64Property;
  value: bigint;
}

export type MapProp = {
  name: string
  type: ProType.MapProperty;
  value: Record<string, PropertyTag>
}

export type PropertyTag =  Int64Prop | MapProp;

export type SaveBody = {
  [key: string]: PropertyTag;
}

export type StelarSaveFile = {
  header: SaveHeader;
  body: SaveBody;
}
