import type { DataRow } from 'types/table';
import { toHex } from 'tracker/decoder/decoder';

type View = {
  readonly offset: number;
  readonly length: number;
}

export class BinaryReader {
  private readonly _buffer: Uint8Array;
  public readonly _view: DataView;
  private readonly _ascii = new TextDecoder('ascii');
  private readonly _utf16 = new TextDecoder('utf-16le');
  private readonly _loggingEnabled: boolean;
  private readonly _log: DataRow[] = [];
  private _offset: number = 0;

  constructor(buffer: Uint8Array, loggingEnabled: boolean = false) {
    this._buffer = buffer;
    this._view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this._loggingEnabled = loggingEnabled;
  }

  public get log(): Readonly<DataRow[]> {
    return this._log;
  }

  public get size(): number {
    return this._buffer.byteLength;
  }

  public get position(): number {
    return this._offset;
  }

  public seek(offset: number): void {
    this._offset = offset;
  }

  public readByte(): number {
    const start = this._offset;
    const value = this._view.getUint8(this._offset);
    this._offset++;
    this.addToLog('Byte', value, { offset: start, length: 1 });
    return value;
  }

  public readASCII(bytes: number): string {
    if (bytes > 1024) {
      throw new Error(`Read length exceeded safety limit: ${bytes} bytes (max 1024)`);
    }
    const start = this._offset;
    const value = this._ascii.decode(this._buffer.subarray(this._offset, this._offset + bytes));
    this._offset += bytes;
    this.addToLog('ASCII', value, { offset: start, length: bytes });
    return value;
  }

  public readInt32(): number {
    const start = this._offset;
    const value = this._view.getInt32(this._offset, true);
    this._offset += 4;
    this.addToLog('Int32', value, { offset: start, length: 4 });
    return value;
  }

  public readInt64(): bigint {
    const start = this._offset;
    const value = this._view.getBigInt64(this._offset, true);
    this._offset += 8;
    this.addToLog('Int64', value, { offset: start, length: 8 });
    return value;
  }

  public readUint32(): number {
    const start = this._offset;
    const value = this._view.getUint32(this._offset, true);
    this._offset += 4;
    this.addToLog('Uint32', value, { offset: start, length: 4 });
    return value;
  }

  public readUint16(): number {
    const start = this._offset;
    const value = this._view.getUint16(this._offset, true);
    this._offset += 2;
    this.addToLog('Uint16', value, { offset: start, length: 2 });
    return value;
  }

  public readInt16(): number {
    const start = this._offset;
    const value = this._view.getInt16(this._offset, true);
    this._offset += 2;
    this.addToLog('Int16', value, { offset: start, length: 2 });
    return value;
  }

  public readInt8(): number {
    const start = this._offset;
    const value = this._view.getInt8(this._offset);
    this._offset += 1;
    this.addToLog('Int8', value, { offset: start, length: 1 });
    return value;
  }

  public readFloat32(): number {
    const start = this._offset;
    const value = this._view.getFloat32(this._offset, true);
    this._offset += 4;
    this.addToLog('Float32', value, { offset: start, length: 4 });
    return value;
  }

  public readFloat64(): number {
    const start = this._offset;
    const value = this._view.getFloat64(this._offset, true);
    this._offset += 8;
    this.addToLog('Float64', value, { offset: start, length: 8 });
    return value;
  }

  public readString(): string {
    const start = this._offset;
    const length = this.readInt32();

    if (length === 0) {
      this.addToLog('String', '', { offset: start, length: 4 });
      return '';
    }

    if (length < 0) {
      const charCount = -length;
      const byteCount = charCount * 2;
      if (byteCount > 1024) {
        throw new Error(`Read length exceeded safety limit: ${byteCount} bytes (max 1024) at ${start}`);
      }
      // Decode UTF-16 and skip the 2-byte null terminator
      const text = this._utf16.decode(this._buffer.subarray(this._offset, this._offset + byteCount - 2));
      this._offset += byteCount;
      this.addToLog('String (UTF16)', text, { offset: start, length: this._offset - start });
      return text;
    }

    if (length > 1024) {
      throw new Error(`Read length exceeded safety limit: ${length} bytes (max 1024) at ${start}`);
    }

    // avoid reading the null termination
    const text = this.readASCII(length - 1);
    // adds one to account for the null termination
    this._offset++;

    this.addToLog('String', text, { offset: start, length: this._offset - start });
    return text;
  }

  public readGUID(): string {
    const start = this._offset;
    const a = this.readUint32();
    const b = this.readUint32();
    const c = this.readUint32();
    const d = this.readUint32();
    const value = (
      a.toString(16).padStart(8, '0') +
      b.toString(16).padStart(8, '0') +
      c.toString(16).padStart(8, '0') +
      d.toString(16).padStart(8, '0')
    ).toUpperCase();
    this.addToLog('GUID', value, { offset: start, length: this._offset - start });
    return value;
  }

  private addToLog(type: string, value: any, view: View): void {
    if (!this._loggingEnabled) return;

    const { offset, length } = view;
    const bytes = this._buffer.subarray(offset, offset + length);

    this._log.push({
      type,
      value,
      byteRange: `${offset}-${offset + length}`,
      byteData: toHex(bytes),
    });
  }
}
