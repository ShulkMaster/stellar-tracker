import { BinaryReader } from './src/tracker/binaryReader/BinaryReader';
import { StreamDecoder } from './src/tracker/streamDecoder/StreamDecoder';
import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const UE_EPOCH_TICKS = 621355968000000000n;
const TICKS_PER_MS = 10000n;

function unrealTicksToDate(ticks: bigint): Date {
  const ms = Number((ticks - UE_EPOCH_TICKS) / TICKS_PER_MS);

  return new Date(ms);
}

function hex(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  return [...bytes]
      .map(b => b.toString(16).padStart(2, "0"))
      .join(" ");
}

async function run() {
  const filePath = path.resolve('./public/SBS00.sav');
  const fileStats = await stat(filePath);
  const blob = await openAsBlob(filePath);
  const stream = blob.stream() as ReadableStream<Uint8Array<ArrayBuffer>>;

  const reader = await BinaryReader.fromStream(fileStats.size, stream);
  const decoder = new StreamDecoder(reader);

  decoder.decodeHeader();
  const dateProp = decoder.decodeProperty() as any;

  const date = unrealTicksToDate(dateProp.value);

  console.log(date.toLocaleDateString());

  console.log(dateProp);

  reader.seek(reader.position + 1);
  const slice = reader._view.buffer.slice(reader.position, reader.position + 64);
  console.log(hex(slice));


  const map = decoder.decodeProperty();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
