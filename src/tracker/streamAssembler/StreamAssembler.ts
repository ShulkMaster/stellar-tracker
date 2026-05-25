import type { SaveHeader } from '../../types/safeFile.ts';
import type { DecodeStepRow, DecodeValue } from '../../types/table.ts';
import { StreamDecoder } from '../streamDecoder/StreamDecoder.ts';

type Container = Record<string, unknown> | unknown[];

export class StreamAssembler {
  private readonly _decoder: StreamDecoder;
  private readonly _header: Record<string, unknown> = { saveClassName: '' };
  private readonly _stack: Container[] = [];
  private _pendingName: string | null = null;

  constructor(decoder: StreamDecoder) {
    this._decoder = decoder;
    this._stack.push(this._header);
  }

  public get header(): SaveHeader {
    return this._header as SaveHeader;
  }

  public parseHeader(): SaveHeader {
    while (this._decoder.canStep) {
      this.applyStep(this._decoder.next());
    }
    this.finalizeOpenContainers();
    return this.header;
  }

  /** Process one decoder step — for incremental UI use. */
  public step(): DecodeStepRow | null {
    if (!this._decoder.canStep) {
      return null;
    }
    const row = this._decoder.next();
    this.applyStep(row);
    return row;
  }

  private applyStep(step: DecodeStepRow): void {
    switch (step.kind) {
      case 'yieldName':
        this._pendingName = step.name;
        break;
      case 'read':
        this.assignValue(step.value);
        break;
      case 'openStruct': {
        const container: Record<string, unknown> = {};
        const target = this.currentTarget();
        if (Array.isArray(target)) {
          target.push(container);
        } else {
          this.assignContainer(step.name, container);
        }
        this._stack.push(container);
        break;
      }
      case 'openArray': {
        const container: unknown[] = [];
        this.assignContainer(step.name, container);
        this._stack.push(container);
        break;
      }
      case 'openMap': {
        const container: Record<string, unknown> = {};
        this.assignContainer(step.name, container);
        this._stack.push(container);
        break;
      }
      case 'close':
      case 'propNone':
        this.popContainer();
        break;
    }
  }

  private assignValue(value: DecodeValue): void {
    if (this._pendingName === null) {
      throw new Error('Read step without a preceding YieldName');
    }

    const target = this.currentTarget();
    if (Array.isArray(target)) {
      target.push(value);
    } else {
      target[this._pendingName] = value;
    }
    this._pendingName = null;
  }

  private assignContainer(name: string, container: Container): void {
    const target = this.currentTarget();
    if (Array.isArray(target)) {
      throw new Error(`Cannot open container "${name}" while assigning into an array`);
    }
    target[name] = container;
  }

  private popContainer(): void {
    if (this._stack.length <= 1) {
      throw new Error('Cannot close container: already at header root');
    }
    this._stack.pop();
    this._pendingName = null;
  }

  private finalizeOpenContainers(): void {
    while (this._stack.length > 1) {
      this._stack.pop();
    }
  }

  private currentTarget(): Container {
    const target = this._stack[this._stack.length - 1];
    if (target === undefined) {
      throw new Error('Assembler stack is empty');
    }
    return target;
  }
}
