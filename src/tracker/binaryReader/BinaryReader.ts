type ReadStream = ReadableStream<Uint8Array<ArrayBuffer>>;

export class BinaryReader {
  private readonly _buffer: Uint8Array;
  private readonly _view: DataView;
  private readonly _ascii = new TextDecoder('ascii');
  private readonly _utf8 = new TextDecoder('utf8');
  private _offset: number = 0;

  constructor(buffer: Uint8Array) {
    this._buffer = buffer;
    this._view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  public static async fromStream(totalSize: number, stream: ReadStream): Promise<BinaryReader> {
    const reader = stream.getReader();
    const combined = new Uint8Array(totalSize);
    let offset = 0;

    while (offset < totalSize) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        combined.set(value, offset);
        offset += value.length;
      }
    }

    return new BinaryReader(combined);
  }

  public get size(): number {
    return this._buffer.byteLength;
  }

  public get position(): number {
    return this._offset;
  }

  public readASCII(bytes: number): string {
    const value = this._ascii.decode(this._buffer.subarray(this._offset, this._offset + bytes));
    this._offset += bytes;
    return value;
  }

  public readUTF8(bytes: number): string {
    const value = this._utf8.decode(this._buffer.subarray(this._offset, this._offset + bytes));
    this._offset += bytes;
    return value;
  }

  public readInt32(): number {
    const value = this._view.getInt32(this._offset, true);
    this._offset += 4;
    return value;
  }

  public readInt64(): bigint {
    const value = this._view.getBigInt64(this._offset, true);
    this._offset += 8;
    return value;
  }

  public readUint16(): number {
    const value = this._view.getUint16(this._offset, true);
    this._offset += 2;
    return value;
  }

  public readString(): string {
    const length = this.readInt32();
    if (length === 0) return '';

    if (length < 0) {
      throw new Error(`Negative string length: ${length}`);
    }

    return this.readASCII(length);
  }
}
