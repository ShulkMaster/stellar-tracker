/**
 * Runtime marker for assembled containers. The `StreamAssembler` stamps
 * `container[ENTITY] = 'struct' | 'map'` on every plain-object container it
 * opens. Arrays carry no marker (`Array.isArray` already distinguishes
 * them).
 *
 * `Symbol.for` is used so the same registry symbol is shared across module
 * graphs (test, harness, app) without relying on a singleton import.
 *
 * The marker is invisible to:
 *   - `Object.keys`, `for ... in`, spread `{ ...obj }`
 *   - `JSON.stringify`
 *   - structural equality checks that walk own string keys
 *
 * It is visible via:
 *   - direct access `container[ENTITY]`
 *   - `Reflect.ownKeys` / `Object.getOwnPropertySymbols`
 *
 * Round-trips through JSON or `structuredClone` drop the marker. A copy
 * helper that preserves it should be written separately if/when needed.
 */
export const ENTITY: unique symbol = Symbol.for('stelar.entity');

export type Entity = 'struct' | 'map';
