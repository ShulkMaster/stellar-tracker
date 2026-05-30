import type { DataRow } from 'types/table';
import { toHex } from 'parser/decoder/decoder';

type View = {
  readonly offset: number;
  readonly length: number;
};

const DEFAULT_INITIAL_CAPACITY = 64;
const SAFETY_LIMIT = 1024;

/**
 * Mirror of `BinaryReader`. Builds a little-endian Uint8Array with the same
 * field set the reader knows how to consume. Useful for fabricating fixture
 * blobs in tests instead of hand-rolling hex `Uint8Array` literals.
 *
 * The internal buffer grows on demand. Use `seek` to backpatch earlier
 * offsets; `toUint8Array` returns the high-water-mark slice of bytes written.
 */
export class BinaryWriter {
  private _buffer: Uint8Array;
  private _view: DataView;
  private readonly _loggingEnabled: boolean;
  private readonly _log: DataRow[] = [];
  private _offset: number = 0;
  private _length: number = 0;

  constructor(initialCapacity: number = DEFAULT_INITIAL_CAPACITY, loggingEnabled: boolean = false) {
    const capacity = Math.max(1, initialCapacity);
    this._buffer = new Uint8Array(capacity);
    this._view = new DataView(this._buffer.buffer);
    this._loggingEnabled = loggingEnabled;
  }

  public get log(): Readonly<DataRow[]> {
    return this._log;
  }

  /** Bytes written so far (high-water mark, ignoring later seeks backwards). */
  public get size(): number {
    return this._length;
  }

  public get position(): number {
    return this._offset;
  }

  public seek(offset: number): void {
    this._offset = offset;
  }

  /** Snapshot the bytes written. Returns a fresh `Uint8Array` of length `size`. */
  public toUint8Array(): Uint8Array {
    return this._buffer.slice(0, this._length);
  }

  public writeSlice(bytes: ArrayLike<number> | Uint8Array): void {
    const length = bytes.length;
    if (length > SAFETY_LIMIT) {
      throw new Error(`Write length exceeded safety limit: ${length} bytes (max ${SAFETY_LIMIT})`);
    }
    const start = this._offset;
    this._ensureCapacity(start + length);
    if (bytes instanceof Uint8Array) {
      this._buffer.set(bytes, start);
    } else {
      for (let i = 0; i < length; i++) {
        this._buffer[start + i] = bytes[i];
      }
    }
    this._advance(length);
    this.addToLog('Slice', length, { offset: start, length });
  }

  public writeByte(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 1);
    this._view.setUint8(start, value);
    this._advance(1);
    this.addToLog('Byte', value, { offset: start, length: 1 });
  }

  public writeASCII(text: string): void {
    const length = text.length;
    if (length > SAFETY_LIMIT) {
      throw new Error(`Write length exceeded safety limit: ${length} bytes (max ${SAFETY_LIMIT})`);
    }
    const start = this._offset;
    this._ensureCapacity(start + length);
    for (let i = 0; i < length; i++) {
      this._buffer[start + i] = text.charCodeAt(i) & 0xff;
    }
    this._advance(length);
    this.addToLog('ASCII', text, { offset: start, length });
  }

  public writeUTF8(text: string): void {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > SAFETY_LIMIT) {
      throw new Error(`Write length exceeded safety limit: ${bytes.length} bytes (max ${SAFETY_LIMIT})`);
    }
    const start = this._offset;
    this._ensureCapacity(start + bytes.length);
    this._buffer.set(bytes, start);
    this._advance(bytes.length);
    this.addToLog('UTF8', text, { offset: start, length: bytes.length });
  }

  public writeInt32(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 4);
    this._view.setInt32(start, value, true);
    this._advance(4);
    this.addToLog('Int32', value, { offset: start, length: 4 });
  }

  public writeInt64(value: bigint): void {
    const start = this._offset;
    this._ensureCapacity(start + 8);
    this._view.setBigInt64(start, value, true);
    this._advance(8);
    this.addToLog('Int64', value, { offset: start, length: 8 });
  }

  public writeUint32(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 4);
    this._view.setUint32(start, value, true);
    this._advance(4);
    this.addToLog('Uint32', value, { offset: start, length: 4 });
  }

  public writeUint16(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 2);
    this._view.setUint16(start, value, true);
    this._advance(2);
    this.addToLog('Uint16', value, { offset: start, length: 2 });
  }

  public writeInt16(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 2);
    this._view.setInt16(start, value, true);
    this._advance(2);
    this.addToLog('Int16', value, { offset: start, length: 2 });
  }

  public writeInt8(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 1);
    this._view.setInt8(start, value);
    this._advance(1);
    this.addToLog('Int8', value, { offset: start, length: 1 });
  }

  public writeFloat32(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 4);
    this._view.setFloat32(start, value, true);
    this._advance(4);
    this.addToLog('Float32', value, { offset: start, length: 4 });
  }

  public writeFloat64(value: number): void {
    const start = this._offset;
    this._ensureCapacity(start + 8);
    this._view.setFloat64(start, value, true);
    this._advance(8);
    this.addToLog('Float64', value, { offset: start, length: 8 });
  }

  /**
   * Mirror of `readString`. Empty strings emit a single Int32 of `0`. ASCII
   * strings (every codepoint < 128) emit a positive length-prefix then the
   * bytes plus a single null terminator. Anything else emits a negative
   * length-prefix (UTF-16 char count, negated) then UTF-16LE bytes plus a
   * two-byte null terminator.
   */
  public writeString(text: string): void {
    const start = this._offset;

    if (text.length === 0) {
      this.writeInt32(0);
      this.addToLog('String', '', { offset: start, length: this._offset - start });
      return;
    }

    if (this.isAscii(text)) {
      const length = text.length + 1;
      if (length > SAFETY_LIMIT) {
        throw new Error(`Write length exceeded safety limit: ${length} bytes (max ${SAFETY_LIMIT})`);
      }
      this.writeInt32(length);
      this.writeASCII(text);
      this.writeByte(0);
      this.addToLog('String', text, { offset: start, length: this._offset - start });
      return;
    }

    const charCount = text.length + 1;
    const byteCount = charCount * 2;
    if (byteCount > SAFETY_LIMIT) {
      throw new Error(`Write length exceeded safety limit: ${byteCount} bytes (max ${SAFETY_LIMIT})`);
    }
    this.writeInt32(-charCount);
    for (let i = 0; i < text.length; i++) {
      this.writeUint16(text.charCodeAt(i));
    }
    this.writeUint16(0);
    this.addToLog('String (UTF16)', text, { offset: start, length: this._offset - start });
  }

  public writeGUID(value: string): void {
    if (value.length !== 32) {
      throw new Error(`Invalid GUID length: expected 32 hex chars, got ${value.length}`);
    }
    const start = this._offset;
    const a = parseInt(value.slice(0, 8), 16);
    const b = parseInt(value.slice(8, 16), 16);
    const c = parseInt(value.slice(16, 24), 16);
    const d = parseInt(value.slice(24, 32), 16);
    if ([a, b, c, d].some((n) => Number.isNaN(n))) {
      throw new Error(`Invalid GUID hex: ${value}`);
    }
    this.writeUint32(a);
    this.writeUint32(b);
    this.writeUint32(c);
    this.writeUint32(d);
    this.addToLog('GUID', value.toUpperCase(), { offset: start, length: this._offset - start });
  }

  /** Append `count` zero bytes (FString trailing nulls, alignment, reserved fields). */
  public padZeros(count: number): void {
    if (count < 0) {
      throw new Error(`padZeros count must be non-negative, got ${count}`);
    }
    if (count === 0) return;
    if (count > SAFETY_LIMIT) {
      throw new Error(`Write length exceeded safety limit: ${count} bytes (max ${SAFETY_LIMIT})`);
    }
    const start = this._offset;
    this._ensureCapacity(start + count);
    this._buffer.fill(0, start, start + count);
    this._advance(count);
    this.addToLog('Padding', count, { offset: start, length: count });
  }

  private _ensureCapacity(needed: number): void {
    const current = this._buffer.byteLength;
    if (needed <= current) return;
    let newCap = current;
    while (newCap < needed) newCap *= 2;
    const grown = new Uint8Array(newCap);
    grown.set(this._buffer);
    this._buffer = grown;
    this._view = new DataView(grown.buffer);
  }

  private _advance(count: number): void {
    this._offset += count;
    if (this._offset > this._length) {
      this._length = this._offset;
    }
  }

  private isAscii(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 0x7f) return false;
    }
    return true;
  }

  private addToLog(type: string, value: unknown, view: View): void {
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
