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
  IntProperty = 'IntProperty',
  FloatProperty = 'FloatProperty',
  BoolProperty = 'BoolProperty',
  ByteProperty = 'ByteProperty',
  StrProperty = 'StrProperty',
  NameProperty = 'NameProperty',
  StructProperty = 'StructProperty',
  MapProperty = 'MapProperty',
  ArrayProperty = 'ArrayProperty',
  TextProperty = 'TextProperty',
  Alias = 'Alias',
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

export type IntProp = {
  name: string;
  type: ProType.IntProperty;
  value: number;
}

export type FloatProp = {
  name: string;
  type: ProType.FloatProperty;
  value: number;
}

export type BoolProp = {
  name: string;
  type: ProType.BoolProperty;
  value: boolean;
}

export type StrProp = {
  name: string;
  type: ProType.StrProperty;
  value: string;
}

export type ByteProp = {
  name: string;
  type: ProType.ByteProperty;
  enumName: string;
  value: string | number;
}

export type MapProp = {
  name: string
  type: ProType.MapProperty;
  entries: number;
  value: Record<string, PropertyTag>
}

export type ArrayProp = {
  name: string;
  type: ProType.ArrayProperty;
  itemType: string;
  value: PropertyTag[];
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

export type PropertyTag = Int64Prop | IntProp | FloatProp | BoolProp | StrProp | ByteProp | MapProp | ArrayProp | NameProp | StructProp;

export type SaveBody = {
  [key: string]: PropertyTag;
}

export type StelarSaveFile = {
  header: SaveHeader;
  body: SaveBody;
}
