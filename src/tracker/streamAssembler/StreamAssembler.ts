import type { PropertyTag, SaveHeader, StelarSaveFile } from 'types/safeFile';

export class StreamAssembler {
  private readonly _root: StelarSaveFile;
  private readonly _stack = new Array<any>();

  constructor(header: SaveHeader) {
    this._root = { header, body: {} };
    this._stack.push(this._root.body);
  }

  public get root(): StelarSaveFile {
    return this._root;
  }

  private get last(): any {
    return this._stack[this._stack.length - 1];
  }

  public append(property: PropertyTag): void {
    const last = this.last;
    if (last === undefined || last === null) {
      console.warn(`Property[${property.name}] is orphaned, skipping`);
      return;
    }

    if (Array.isArray(last)) {
      last.push(property);
      return;
    }

    if (typeof last === 'object') {
      last[property.name] = property;
      return;
    }

    throw Error(`Invalid last object[${typeof last}] in stack`);
  }
}