import { describe, it } from 'vitest';
import { BinaryReader } from '../binaryReader/BinaryReader';
import { StreamDecoder } from './StreamDecoder';
import { ProType } from '../../types/safeFile';
import * as fs from 'fs';
import * as path from 'path';

describe.skip('Explore File', () => {
  it('should parse as much as possible from SBS00.sav', () => {
    const filePath = path.resolve(__dirname, '../../../public/SBS00.sav');
    const buffer = fs.readFileSync(filePath);
    const reader = new BinaryReader(new Uint8Array(buffer), true);
    const decoder = new StreamDecoder(reader);

    console.log('--- Decoding Header ---');
    const header = decoder.decode();

    console.log('--- Decoding Properties ---');
    try {
      while (reader.position < reader.size) {
        const prop = decoder.decodeProperty();
        console.log(`Top-Level Prop: ${prop.name} (${prop.type}) ends at ${reader.position}`);
        if (prop.name === ProType.None) {
          console.log(`Reached TOP-LEVEL None property at ${reader.position}`);
          break;
        }
      }
    } catch (e: any) {
      console.error(`Error during property decoding at ${reader.position}:`, e.message);
      const start = Math.max(0, reader.position - 64);
      const end = Math.min(reader.size, reader.position + 64);
      const slice = buffer.slice(start, end);
      console.log(`Context at ${reader.position}: ${slice.toString('hex')}`);
    }

    console.log('--- After first None property ---');
    console.log(`Current position: ${reader.position} / ${reader.size}`);

    if (reader.position < reader.size) {
        try {
            console.log('Trying to decode another property...');
            const prop = decoder.decodeProperty();
            console.log(`Next Prop: ${prop.name} (${prop.type})`);
        } catch (e: any) {
             console.log('Not a standard property list anymore.');
             const start = reader.position;
             const slice = buffer.slice(start, Math.min(reader.size, start + 64));
             console.log(`Data at ${start}: ${slice.toString('hex')}`);
             try { reader.seek(start); console.log('String at pos:', reader.readString()); } catch {}
        }
    }
  });
});
