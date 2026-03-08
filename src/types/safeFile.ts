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
  versionCount: number;
}

export type StelarSaveFile = {
  header: SaveHeader;
}
