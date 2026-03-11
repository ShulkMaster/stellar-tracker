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
  None = 'None',
  Int64Property = 'Int64Property',
  MapProperty = 'MapProperty',
  NameProperty = 'NameProperty',
  StructProperty = 'StructProperty',
}

export type PropertyParseContext = {
  propName: string;
  propType: string;
  byteSize: number;
  arrayIndex: number;
}

export type Int64Prop = {
  name: string;
  type: ProType.Int64Property;
  guid: string | undefined;
  value: bigint;
}

export type MapProp = {
  name: string
  type: ProType.MapProperty;
  entries: number;
  value: Record<string, PropertyTag>
}

export type NameProp = {
  name: string;
  type: ProType.NameProperty;
  value: string;
}

export type StructProp = {
  name: string;
  type: ProType.StructProperty;
  value: any;
}

export type PropertyTag = Int64Prop | MapProp | NameProp | StructProp;

export type SaveBody = {
  [key: string]: PropertyTag;
}

export type StelarSaveFile = {
  header: SaveHeader;
  body: SaveBody;
}
