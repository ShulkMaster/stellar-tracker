import { describe, it, expect } from 'vitest';
import { Opcode } from './Opcodes.ts';
import { RingBuffer } from './RingBuffer.ts';

describe('RingBuffer.create', () => {
  it('rounds requested capacity up to the next power of 2', () => {
    expect(RingBuffer.create(1).capacity).toBe(1);
    expect(RingBuffer.create(64).capacity).toBe(64);
    expect(RingBuffer.create(65).capacity).toBe(128);
  });
});

describe('RingBuffer encode/decode', () => {
  it('decodes typed opcodes', () => {
    const buffer = RingBuffer.create(4);
    buffer.fixInt32(1);
    expect(buffer.decode()).toBe(Opcode.FixInt32);
    expect(buffer.available).toBe(0);
  });

  it('round-trips byte and bool', () => {
    const buffer = RingBuffer.create(16);
    buffer.pushByte(0xab);
    buffer.pushBool(true);
    buffer.pushBool(false);

    expect(buffer.byte()).toBe(0xab);
    expect(buffer.bool()).toBe(true);
    expect(buffer.bool()).toBe(false);
  });

  it('round-trips int16 single and batch', () => {
    const buffer = RingBuffer.create(32);
    buffer.pushInt16(-1);
    buffer.pushInt16(0x7fff);
    buffer.pushInt16(42);
    buffer.pushInt16(-100);

    expect(buffer.int16()).toBe(-1);
    expect(buffer.int16()).toBe(0x7fff);
    expect(buffer.int16(2)).toEqual([42, -100]);
  });

  it('round-trips int32 single and batch', () => {
    const buffer = RingBuffer.create(32);
    buffer.pushInt32(0xdeadbeef);
    buffer.pushInt32(-1);
    buffer.pushInt32(1);
    buffer.pushInt32(2);

    expect(buffer.int32()).toBe(0xdeadbeef | 0);
    expect(buffer.int32()).toBe(-1);
    expect(buffer.int32(2)).toEqual([1, 2]);
  });

  it('round-trips float single and batch', () => {
    const buffer = RingBuffer.create(32);
    buffer.pushFloat(3.14);
    buffer.pushFloat(-0.5);
    buffer.pushFloat(1);
    buffer.pushFloat(2);

    expect(buffer.float()).toBeCloseTo(3.14);
    expect(buffer.float()).toBeCloseTo(-0.5);
    expect(buffer.float(2)).toEqual([1, 2]);
  });

  it('round-trips ascii', () => {
    const buffer = RingBuffer.create(32);
    buffer.pushAscii('ABC', 3);

    expect(buffer.ascii(3)).toBe('ABC');
  });

  it('round-trips DummyI32 opcode with int32 argument', () => {
    const buffer = RingBuffer.create(16);
    buffer.pushDummyI32(0xdeadbeef);

    expect(buffer.decode()).toBe(Opcode.DummyI32);
    expect(buffer.int32()).toBe(0xdeadbeef | 0);
    expect(buffer.available).toBe(0);
  });
});

describe('RingBuffer wrap-around', () => {
  it('preserves values when head and tail cross the buffer end', () => {
    const buffer = RingBuffer.create(8);

    buffer.pushByte(1);
    buffer.pushByte(2);
    buffer.pushByte(3);
    buffer.pushByte(4);
    buffer.pushByte(5);
    buffer.pushByte(6);

    expect(buffer.byte()).toBe(1);
    expect(buffer.byte()).toBe(2);
    expect(buffer.byte()).toBe(3);
    expect(buffer.byte()).toBe(4);

    buffer.pushInt16(-42);
    buffer.pushFloat(2.5);

    expect(buffer.byte()).toBe(5);
    expect(buffer.byte()).toBe(6);
    expect(buffer.int16()).toBe(-42);
    expect(buffer.float()).toBeCloseTo(2.5);
    expect(buffer.available).toBe(0);
  });

  it('reads ascii correctly when the run wraps', () => {
    const buffer = RingBuffer.create(8);

    for (let i = 0; i < 7; i++) {
      buffer.pushByte(0xff);
    }
    for (let i = 0; i < 6; i++) {
      buffer.byte();
    }

    buffer.pushAscii('XY', 2);
    buffer.byte();
    expect(buffer.ascii(2)).toBe('XY');
  });
});

describe('RingBuffer bounds', () => {
  it('throws on overflow', () => {
    const buffer = RingBuffer.create(4);
    buffer.pushByte(1);
    buffer.pushByte(2);
    buffer.pushByte(3);
    buffer.pushByte(4);

    expect(() => buffer.pushByte(5)).toThrow('RingBuffer overflow');
  });

  it('throws on underflow', () => {
    const buffer = RingBuffer.create(4);
    expect(() => buffer.decode()).toThrow('RingBuffer underflow');
  });
});

describe('RingBuffer memory stability', () => {
  it('reuses the same backing ArrayBuffer across wrap cycles', () => {
    const buffer = RingBuffer.create(16);
    const initialRef = buffer.backingBufferRef();

    for (let i = 0; i < 10_000; i++) {
      buffer.pushDummyI32(i);
      buffer.pushByte(i & 0xff);
      buffer.pushBool(i % 2 === 0);
      buffer.pushInt16(i);
      buffer.pushFloat(i * 0.25);

      expect(buffer.backingBufferRef()).toBe(initialRef);
      expect(buffer.capacity).toBe(16);
      expect(buffer.bufferByteLength).toBe(16);

      expect(buffer.decode()).toBe(Opcode.DummyI32);
      expect(buffer.int32()).toBe(i);
      expect(buffer.byte()).toBe(i & 0xff);
      expect(buffer.bool()).toBe(i % 2 === 0);
      expect(buffer.int16()).toBe(i);
      expect(buffer.float()).toBeCloseTo(i * 0.25);

      expect(buffer.available).toBe(0);
      expect(buffer.backingBufferRef()).toBe(initialRef);
    }
  });

  it('reports same backing buffer between two instances only when distinct', () => {
    const a = RingBuffer.create(8);
    const b = RingBuffer.create(8);

    expect(a.sameBackingBuffer(a)).toBe(true);
    expect(a.sameBackingBuffer(b)).toBe(false);
  });
});
