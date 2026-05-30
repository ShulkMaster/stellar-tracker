import type { SaveHeader } from 'types/safeFile';
import type { DecodeStepRow, DecodeValue } from 'types/table';
import { ENTITY } from 'types/entity';
import { StreamDecoder } from 'parser/streamDecoder/StreamDecoder';

type ObjectContainer = Record<string | symbol, unknown>;
type Container = ObjectContainer | unknown[];

export class StreamAssembler {
  private readonly _decoder: StreamDecoder;
  private readonly _header: ObjectContainer = {
    saveClassName: '',
    [ENTITY]: 'struct',
  };
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
      case 'tagHeader':
      case 'control':
        // Lifecycle / debug-only events: surfaced to the UI, not assembled.
        break;
      case 'openStruct': {
        const container: ObjectContainer = { [ENTITY]: 'struct' };
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
        const container: ObjectContainer = { [ENTITY]: 'map' };
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
    const target = this.currentTarget();
    if (Array.isArray(target)) {
      // Array elements legitimately have no preceding YieldName (the array
      // container is keyed once at OpenArray time; subsequent reads just
      // append). Push and clear any stale pending name.
      target.push(value);
      this._pendingName = null;
      return;
    }

    if (this._pendingName === null) {
      throw new Error('Read step without a preceding YieldName');
    }
    target[this._pendingName] = value;
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
