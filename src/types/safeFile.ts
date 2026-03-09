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

export type StelarSaveFile = {
  header: SaveHeader;
}
