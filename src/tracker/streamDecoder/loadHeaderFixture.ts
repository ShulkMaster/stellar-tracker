import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = dirname(fileURLToPath(import.meta.url));

/** SBS00.sav bytes 0x00–0x4B6: full GVAS header through saveClassName (1207 B). */
export function loadHeaderThroughSaveClass(): Uint8Array {
  return new Uint8Array(readFileSync(join(fixtureDir, 'headerThroughSaveClass.bin')));
}
