export class BinaryReader {
  private readonly _buffer: Uint8Array;
  private readonly _view: DataView;
  private _offset: number = 0;

  constructor(buffer: Uint8Array) {
    this._buffer = buffer;
    this._view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  public static async fromStream(stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<BinaryReader> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }

    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
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
    const value = new TextDecoder('ascii').decode(
      this._buffer.subarray(this._offset, this._offset + bytes),
    );
    this._offset += bytes;
    return value;
  }

  public readUTF8(bytes: number): string {
    const value = new TextDecoder('utf-8').decode(
      this._buffer.subarray(this._offset, this._offset + bytes),
    );
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
}
