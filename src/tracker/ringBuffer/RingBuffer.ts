import { Opcode } from './Opcodes.ts';

const SCRATCH_ASCII_MAX = 1024;

function nextPowerOfTwo(n: number): number {
  return 1 << Math.ceil(Math.log2(Math.max(1, n)));
}

export class RingBuffer {
  private readonly _buffer: Uint8Array;
  private readonly _mask: number;
  private readonly _ascii = new TextDecoder('ascii');
  private readonly _scratch4: Uint8Array;
  private readonly _scratch4View: DataView;
  private readonly _scratchAscii: Uint8Array;
  private _head = 0;
  private _tail = 0;

  private constructor(capacity: number) {
    this._buffer = new Uint8Array(capacity);
    this._mask = capacity - 1;
    this._scratch4 = new Uint8Array(4);
    this._scratch4View = new DataView(this._scratch4.buffer);
    this._scratchAscii = new Uint8Array(SCRATCH_ASCII_MAX);
  }

  public static create(requestedCapacity: number): RingBuffer {
    return new RingBuffer(nextPowerOfTwo(requestedCapacity));
  }

  public get capacity(): number {
    return this._buffer.byteLength;
  }

  public get available(): number {
    return this._tail - this._head;
  }

  public get free(): number {
    return this.capacity - this.available;
  }

  public get bufferByteLength(): number {
    return this.capacity;
  }

  public sameBackingBuffer(other: RingBuffer): boolean {
    return this._buffer.buffer === other._buffer.buffer;
  }

  public backingBufferRef(): ArrayBufferLike {
    return this._buffer.buffer;
  }

  public private(op: Opcode): void {
    this.pushByte(op);
  }

  public fixAscii(chars: number): void {
    this.pushByte(Opcode.FixAscii);
    this.pushInt16(chars);
  }

  public fixInt32(ints: number): void {
    this.pushByte(Opcode.FixInt32);
    this.pushInt16(ints);
  }

  public pushByte(value: number): void {
    this.ensureFree(1);
    this._buffer[this._tail & this._mask] = value & 0xff;
    this._tail++;
  }

  public pushBool(value: boolean): void {
    this.pushByte(value ? 1 : 0);
  }

  public pushInt16(value: number): void {
    this.writeInt16(this._tail, value);
    this._tail += 2;
  }

  public pushInt32(value: number): void {
    this.writeInt32(this._tail, value);
    this._tail += 4;
  }

  public pushFloat(value: number): void {
    this.writeFloat32(this._tail, value);
    this._tail += 4;
  }

  public pushAscii(value: string, chars?: number): void {
    const count = chars ?? value.length;
    this.ensureFree(count);

    for (let i = 0; i < count; i++) {
      const code = i < value.length ? value.charCodeAt(i) : 0;
      this._buffer[this._tail & this._mask] = code & 0xff;
      this._tail++;
    }
  }

  public pushDummyI32(value: number): void {
    this.pushByte(Opcode.DummyI32);
    this.pushInt32(value);
  }

  public decode(): Opcode {
    return this.byte() as Opcode;
  }

  public byte(): number {
    this.ensureAvailable(1);
    const value = this._buffer[this._head & this._mask];
    this._head++;
    return value;
  }

  public bool(): boolean {
    return this.byte() !== 0;
  }

  public int16(ints?: 1): number;
  public int16(ints: number): number | number[];
  public int16(ints = 1): number | number[] {
    if (ints === 1) {
      return this.readInt16();
    }

    const result = new Array<number>(ints);
    for (let i = 0; i < ints; i++) {
      result[i] = this.readInt16();
    }
    return result;
  }

  public int32(ints?: 1): number;
  public int32(ints: number): number | number[];
  public int32(ints = 1): number | number[] {
    if (ints === 1) {
      return this.readInt32();
    }

    const result = new Array<number>(ints);
    for (let i = 0; i < ints; i++) {
      result[i] = this.readInt32();
    }
    return result;
  }

  public float(floats?: 1): number;
  public float(floats: number): number | number[];
  public float(floats = 1): number | number[] {
    if (floats === 1) {
      return this.readFloat32();
    }

    const result = new Array<number>(floats);
    for (let i = 0; i < floats; i++) {
      result[i] = this.readFloat32();
    }
    return result;
  }

  public ascii(chars = 1): string {
    this.ensureAvailable(chars);

    if (chars > SCRATCH_ASCII_MAX) {
      throw new Error(`ASCII read length exceeded safety limit: ${chars} bytes (max ${SCRATCH_ASCII_MAX})`);
    }

    const start = this._head & this._mask;

    if (start + chars <= this.capacity) {
      const value = this._ascii.decode(this._buffer.subarray(start, start + chars));
      this._head += chars;
      return value;
    }

    for (let i = 0; i < chars; i++) {
      this._scratchAscii[i] = this._buffer[(this._head + i) & this._mask];
    }
    const value = this._ascii.decode(this._scratchAscii.subarray(0, chars));
    this._head += chars;
    return value;
  }

  private ensureFree(bytes: number): void {
    if (bytes > this.free) {
      throw new Error(`RingBuffer overflow: need ${bytes} bytes, have ${this.free} free`);
    }
  }

  private ensureAvailable(bytes: number): void {
    if (bytes > this.available) {
      throw new Error(`RingBuffer underflow: need ${bytes} bytes, have ${this.available} available`);
    }
  }

  private writeInt16(index: number, value: number): void {
    this.ensureFree(2);
    this._scratch4View.setInt16(0, value, true);
    this._buffer[index & this._mask] = this._scratch4[0]!;
    this._buffer[(index + 1) & this._mask] = this._scratch4[1]!;
  }

  private writeInt32(index: number, value: number): void {
    this.ensureFree(4);
    this._scratch4View.setInt32(0, value, true);
    for (let i = 0; i < 4; i++) {
      this._buffer[(index + i) & this._mask] = this._scratch4[i]!;
    }
  }

  private writeFloat32(index: number, value: number): void {
    this.ensureFree(4);
    this._scratch4View.setFloat32(0, value, true);
    for (let i = 0; i < 4; i++) {
      this._buffer[(index + i) & this._mask] = this._scratch4[i]!;
    }
  }

  private readInt16(): number {
    this.ensureAvailable(2);
    this._scratch4[0] = this._buffer[this._head & this._mask]!;
    this._scratch4[1] = this._buffer[(this._head + 1) & this._mask]!;
    const value = this._scratch4View.getInt16(0, true);
    this._head += 2;
    return value;
  }

  private readInt32(): number {
    this.ensureAvailable(4);
    for (let i = 0; i < 4; i++) {
      this._scratch4[i] = this._buffer[(this._head + i) & this._mask];
    }
    const value = this._scratch4View.getInt32(0, true);
    this._head += 4;
    return value;
  }

  private readFloat32(): number {
    this.ensureAvailable(4);
    for (let i = 0; i < 4; i++) {
      this._scratch4[i] = this._buffer[(this._head + i) & this._mask];
    }
    const value = this._scratch4View.getFloat32(0, true);
    this._head += 4;
    return value;
  }
}
