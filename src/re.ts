/**
 * re.ts — Reverse-engineering harness for Stellar Blade .sav files.
 *
 * Drives the parser pipeline (BinaryReader + StreamDecoder) against a
 * save file and keeps every decode step + every primitive byte read in
 * memory. On failure, the script prints the tail of the log and a hex
 * window around the failing offset so the parser can be walked
 * backwards from a desync point.
 *
 * Run with: `pnpm re [-- flags]`
 *
 * Flags:
 *   --file PATH      target .sav (default: public/SBS00.sav)
 *   --limit N        stop after N decode steps (0 = unlimited)
 *   --tail N         trailing entries to print on failure   (default 30)
 *   --reads N        trailing byte-reads to print on failure (default 30)
 *   --hex N          hex window radius in bytes              (default 64)
 *   --from N         start index of a log slice to print
 *   --count N        slice length (used with --from)
 *   --json           dump full step log as JSON to stdout
 *   --export           write assembled save to save.json on 100% EOF success
 *   --quiet            suppress success preview
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import type { DataRow, DecodeStepRow } from 'types/table';
import { safeStringify } from 'lib/safeStringify';
import { BinaryReader, StreamDecoder, StreamAssembler } from 'tracker';

type Args = {
  file: string;
  limit: number;
  tail: number;
  reads: number;
  hex: number;
  from: number;
  count: number;
  json: boolean;
  export: boolean;
  quiet: boolean;
};

type LoggedStep = {
  index: number;
  positionBefore: number;
  positionAfter: number;
  row: DecodeStepRow;
};

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
  };
  const num = (flag: string, fallback: number): number => {
    const v = Number(get(flag, String(fallback)));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    file: get('--file', 'public/SBS00.sav'),
    limit: num('--limit', 0),
    tail: num('--tail', 30),
    reads: num('--reads', 30),
    hex: num('--hex', 64),
    from: num('--from', -1),
    count: num('--count', 20),
    json: argv.includes('--json'),
    export: argv.includes('--export'),
    quiet: argv.includes('--quiet'),
  };
}

function hex(n: number, width = 0): string {
  return n.toString(16).padStart(width, '0');
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function pct(num: number, den: number): string {
  return den === 0 ? '0%' : `${((num / den) * 100).toFixed(2)}%`;
}

function hexWindow(buf: Uint8Array, center: number, span: number): string {
  const start = Math.max(0, center - span) & ~0xf;
  const end = Math.min(buf.length, center + span);
  const lines: string[] = [];
  for (let row = start; row < end; row += 16) {
    const rowEnd = Math.min(end, row + 16);
    const cols: string[] = [];
    const ascii: string[] = [];
    for (let i = row; i < rowEnd; i++) {
      const b = buf[i];
      cols.push(hex(b, 2));
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    const padded = cols.join(' ').padEnd(16 * 3 - 1, ' ');
    const marker = row <= center && center < rowEnd ? `  <-- @0x${hex(center)}` : '';
    lines.push(`${hex(row, 8)}: ${padded}  ${ascii.join('')}${marker}`);
  }
  return lines.join('\n');
}

function jsonValue(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
}

function formatStep(s: LoggedStep): string {
  const row = s.row;
  const pos =
    `@0x${hex(s.positionBefore, 6)}..0x${hex(s.positionAfter, 6)}`;
  const head = `#${String(s.index).padStart(5, '0')} ${pos}`;
  const idx = (n: number | undefined): string => (n === undefined ? '' : ` [${n}]`);

  if (row.kind === 'yieldName') {
    return `${head} YieldName    name=${row.name}${idx(row.index)}`;
  }
  if (row.kind === 'openStruct') {
    return `${head} OpenStruct   name=${row.name}${idx(row.index)}`;
  }
  if (row.kind === 'openArray') {
    const count = row.count !== undefined ? ` count=${row.count}` : '';
    return `${head} OpenArray    name=${row.name}${count}`;
  }
  if (row.kind === 'openMap') {
    return `${head} OpenMap      name=${row.name}`;
  }
  if (row.kind === 'close') {
    return `${head} Close${idx(row.index)}`;
  }
  if (row.kind === 'propNone') {
    return `${head} PropNone`;
  }
  if (row.kind === 'tagHeader') {
    const val = jsonValue(row.value);
    const valTrunc = val.length > 48 ? `${val.slice(0, 45)}...` : val;
    return (
      `${head} ` +
      `TagHeader   field=${row.field.padEnd(12)} ` +
      `bytes=[${row.bytes}]`.padEnd(36) +
      ` value=${valTrunc}`
    );
  }
  if (row.kind === 'control') {
    const detail = row.detail !== undefined ? ` (${row.detail})` : '';
    return `${head} Control      ${row.label}${detail}`;
  }

  const val = jsonValue(row.value);
  const valTrunc = val.length > 48 ? `${val.slice(0, 45)}...` : val;
  return (
    `${head} ` +
    `${row.opcode.padEnd(10)} args=${String(row.args).padEnd(4)} ` +
    `bytes=[${row.bytes}]`.padEnd(48) +
    ` value=${valTrunc}${idx(row.index)}`
  );
}

function formatRead(r: DataRow): string {
  const val = jsonValue(r.value);
  const valTrunc = val.length > 48 ? `${val.slice(0, 45)}...` : val;
  return `  ${r.type.padEnd(14)} @${r.byteRange.padEnd(16)} bytes=[${r.byteData}]`.padEnd(80) + ` value=${valTrunc}`;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const path = resolve(args.file);
  const data = readFileSync(path);
  const buffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  const reader = new BinaryReader(buffer, true);
  const decoder = new StreamDecoder(reader);
  const assembler = new StreamAssembler(decoder);

  const steps: LoggedStep[] = [];
  let crashed: unknown = undefined;
  let crashPosition = 0;

  console.log(`re: ${args.file}  size=${fmtBytes(buffer.length)} (${buffer.length} B)`);

  try {
    while (decoder.canStep) {
      if (args.limit > 0 && steps.length >= args.limit) {
        console.log(`re: stopped at --limit ${args.limit}`);
        break;
      }
      const positionBefore = decoder.position;
      const row = assembler.step();
      if (row === null) {
        break;
      }
      steps.push({
        index: steps.length,
        positionBefore,
        positionAfter: decoder.position,
        row,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('underflow') && decoder.position >= buffer.length - 16) {
      // Drained body; optional trailing bytes may leave queued opcodes without wire data.
    } else {
      crashed = err;
      crashPosition = decoder.position;
    }
  }

  const readLog = reader.log;
  const progress = `steps=${steps.length} reads=${readLog.length} bytes=${decoder.position}/${decoder.totalSize} (${pct(decoder.position, decoder.totalSize)})`;

  if (crashed) {
    const msg = crashed instanceof Error ? crashed.message : String(crashed);
    console.error(`re: ${progress}`);
    console.error(`\nre: FAILED at step ${steps.length} offset 0x${hex(crashPosition)}`);
    console.error(`    ${msg}\n`);

    const tail = Math.min(args.tail, steps.length);
    if (tail > 0) {
      console.error(`re: last ${tail} steps (walk backwards from desync):`);
      for (let i = steps.length - tail; i < steps.length; i++) {
        console.error(formatStep(steps[i]));
      }
    }

    const readTail = Math.min(args.reads, readLog.length);
    if (readTail > 0) {
      console.error(`\nre: last ${readTail} byte-reads:`);
      for (let i = readLog.length - readTail; i < readLog.length; i++) {
        console.error(formatRead(readLog[i]));
      }
    }

    console.error(`\nre: hex around 0x${hex(crashPosition)} (radius ${args.hex} B):`);
    console.error(hexWindow(buffer, crashPosition, args.hex));
    return 1;
  }

  console.log(`re: ${progress}`);

  if (decoder.position === decoder.totalSize) {
    console.log('re: EOF reached');
  } else if (!decoder.canStep) {
    const left = decoder.totalSize - decoder.position;
    console.log(`re: opcode queue empty, ${left} B (${pct(left, decoder.totalSize)}) of file remaining`);
  }

  if (args.from >= 0) {
    const fromIdx = Math.min(args.from, steps.length);
    const toIdx = Math.min(fromIdx + args.count, steps.length);
    console.log(`\nre: slice [${fromIdx}..${toIdx}):`);
    for (let i = fromIdx; i < toIdx; i++) {
      console.log(formatStep(steps[i]));
    }
  } else if (!args.quiet) {
    const preview = Math.min(args.tail, steps.length);
    if (preview > 0) {
      console.log(`\nre: last ${preview} steps:`);
      for (let i = steps.length - preview; i < steps.length; i++) {
        console.log(formatStep(steps[i]));
      }
    }
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({ steps, reads: readLog }, null, 2));
    process.stdout.write('\n');
  }

  if (
    args.export
    && args.limit === 0
    && decoder.position === decoder.totalSize
  ) {
    const outPath = resolve('save.json');
    const json = safeStringify(assembler.header);
    writeFileSync(outPath, json, 'utf8');
    console.log(`re: wrote save.json (${fmtBytes(Buffer.byteLength(json, 'utf8'))})`);
  }

  return 0;
}

process.exit(main());
