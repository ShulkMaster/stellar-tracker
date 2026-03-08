export class BinaryReader {
    private readonly _stream: ReadableStream<Uint8Array<ArrayBuffer>>;

    constructor(stream: ReadableStream<Uint8Array<ArrayBuffer>>) {
        this._stream = stream;
    }

    public get size(): number {
    }

    public get position(): number {

    }

    public readASCII(bytes: number): string {}

    public readUTF8(bytes: number): string {}

    public readInt32(): number {}
    public readInt64(): number {}
}