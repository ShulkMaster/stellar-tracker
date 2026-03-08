export class BinaryReader {
    private readonly _size = 0;
    private readonly _stream: ReadableStream<Uint8Array<ArrayBuffer>>;
    private _position = 0;

    constructor(fileSize: number, stream: ReadableStream<Uint8Array<ArrayBuffer>>) {
      this._size = fileSize;
      this._stream = stream;
    }

    public get size(): number {
      return this._size;
    }

    public get position(): number {
      return this._position;
    }

    public readASCII(bytes: number): string {}

    public readUTF8(bytes: number): string {}

    public readInt32(): number {}
    public readInt64(): number {}
}