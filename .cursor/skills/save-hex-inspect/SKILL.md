---
name: save-hex-inspect
description: Inspect Stellar Blade .sav (GVAS) bytes from the shell using Linux hex utilities (xxd, hexdump, od, dd, strings, cmp, python3). Use when reverse engineering save files, locating property/string offsets, validating parser output, diagnosing parser desync, comparing two saves, or extracting byte slices for fixtures.
---

# Save Hex Inspect

CLI patterns for poking at `public/SBS00.sav` and similar GVAS binaries while the parser is being built.

All commands assume cwd is the repo root and the file is `public/SBS00.sav` unless noted.

## Quick orientation

```bash
ls -la public/*.sav
file public/SBS00.sav
stat -c '%s bytes' public/SBS00.sav
```

`file` reports `data` for `.sav` — that is expected (no registered magic).

## Hex window

Default tool: `xxd` with `-s` (start offset) and `-l` (length).

```bash
xxd -s 0      -l 128 public/SBS00.sav   # header
xxd -s 0x4B7  -l 96  public/SBS00.sav   # first property region (SBS00 specific)
xxd -s -64           public/SBS00.sav   # last 64 bytes (trailing data)
```

Offsets accept hex (`0x...`) or decimal. Negative `-s` reads from EOF.

Alternative formatters when ASCII alignment matters more:

```bash
hexdump -C -n 64 -s 0x4B7 public/SBS00.sav
od -A x -t x1z -v -N 64 -j 0x4B7 public/SBS00.sav
```

- `xxd -c 16` controls column count.
- `xxd -g 1` switches grouping to single bytes (default groups 2).
- `xxd -p` emits plain hex (no offsets/ASCII) — good for diffing or piping.

## Slice a byte range to disk

`dd` extracts an exact slice for use as a test fixture:

```bash
# 256 bytes starting at offset 0x4B7
dd if=public/SBS00.sav of=/tmp/firstprop.bin bs=1 skip=$((0x4B7)) count=256 status=none
xxd /tmp/firstprop.bin
```

`bs=1` is slow on large ranges; for big extractions use `bs=4096 skip=` in blocks or prefer `tail -c +OFFSET file | head -c LEN`.

## Find ASCII tokens and their offsets

GVAS uses FStrings with a length prefix, so property names (`NewGameCreateTime`, `Int64Property`, etc.) appear as readable ASCII surrounded by their length prefix.

```bash
strings -t x -n 4 public/SBS00.sav | head -40
strings -t x -n 4 public/SBS00.sav | grep -i 'SaveGame\|Property'
```

`-t x` prints hex offsets; `-n 4` filters runs shorter than 4 chars.

To find a specific token byte-aligned:

```bash
LC_ALL=C grep -aobP 'Int64Property\x00' public/SBS00.sav | head
```

`-a` treats binary as text; `-o` outputs match only; `-b` prefixes byte offset.

## Decode primitives at an offset

Use Python for unambiguous little-endian decoding:

```bash
python3 - <<'PY'
import struct
with open('public/SBS00.sav','rb') as f: d=f.read()
off = 0x14
maj,mn,pt,cl = struct.unpack_from('<HHHI', d, off)
print(f'EngineVersion {maj}.{mn}.{pt} CL={cl}')
PY
```

Common formats (`struct` little-endian):

| Type | Code | Bytes |
|------|------|-------|
| Int16 / Uint16 | `<h` / `<H` | 2 |
| Int32 / Uint32 | `<i` / `<I` | 4 |
| Int64 / Uint64 | `<q` / `<Q` | 8 |
| Float32 | `<f` | 4 |
| Float64 | `<d` | 8 |

## Decode an FString at an offset

```bash
python3 - <<'PY'
import struct, sys
off = int(sys.argv[1], 0)
with open('public/SBS00.sav','rb') as f: d=f.read()
n = struct.unpack_from('<i', d, off)[0]
if n > 0:
    s = d[off+4:off+4+n-1].decode('ascii','replace'); end = off+4+n
elif n < 0:
    b = (-n)*2; s = d[off+4:off+4+b-2].decode('utf-16le','replace'); end = off+4+b
else:
    s = ''; end = off+4
print(f'@{off:#x} len={n} -> {s!r}; next @ {end:#x}')
PY 0x4B7
```

Save this loop in a one-liner; reuse to walk a property tag header (Name → Type → Size → ArrayIndex).

## Walk property tags from an offset

For desync hunting, decode `Name`, `Type`, `Size`, `ArrayIndex` and compute where the next tag *should* start (`offset_after_tag_header + Size`):

```bash
python3 - <<'PY'
import struct
P = 'public/SBS00.sav'
with open(P,'rb') as f: d=f.read()

def fstring(off):
    n = struct.unpack_from('<i', d, off)[0]
    if n > 0:  return d[off+4:off+4+n-1].decode('ascii','replace'), off+4+n
    if n < 0:  b=(-n)*2; return d[off+4:off+4+b-2].decode('utf-16le','replace'), off+4+b
    return '', off+4

p = 0x4B7   # start of first property in SBS00.sav
for _ in range(8):
    start = p
    name, p = fstring(p)
    if name == 'None':
        print(f'@{start:#x} None — end of list'); break
    typ, p = fstring(p)
    size = struct.unpack_from('<i', d, p)[0]; p += 4
    ai   = struct.unpack_from('<i', d, p)[0]; p += 4
    print(f'@{start:#x} {name!r} : {typ}  size={size} arrayIdx={ai}')
    # metadata + separator + value live in the next `size` (+ metadata) bytes; we naively skip value only:
    # NOTE: each property type has different metadata bytes between header and value.
PY
```

This is the same loop the TS parser implements; use it to verify expected offsets before changing parser code.

## Compare two saves

```bash
cmp -l public/SBS00.sav public/SBS01.sav | head -40
# diff hex side-by-side:
diff <(xxd public/SBS00.sav) <(xxd public/SBS01.sav) | less
```

`cmp -l` prints (byte-offset, byte-a-octal, byte-b-octal) — divergence points are the first place a new game state shows up.

## Convert between hex/decimal

```bash
printf '0x%x\n' 1207     # 1207 -> 0x4b7
printf '%d\n'  0x4b7     # 0x4b7 -> 1207
```

## Project conventions

- Use offsets in **hex** in commit messages, comments, and test fixtures so they map to `xxd` output directly.
- When adding a new Vitest fixture, copy the **smallest byte range** that reproduces the case (`dd` slice), and paste both the hex and the decoded interpretation in the test comment.
- Treat `public/SBS00.sav` as the canonical real save; do not commit modified versions.

## Companion: the `re` harness

For end-to-end parser runs use `pnpm re` (script: `re.ts` at the repo root). It drives the real `StreamDecoder` against `public/SBS00.sav`, keeps every decode step + every byte read in memory, and on failure prints the trailing log + a hex window. The shell tools in this skill are for *ad-hoc* byte-level questions; the harness is the primary feedback loop while extending the parser.

## Cross-reference

- Byte layout reference: `../../rules/gvas-format.mdc`
- Parser invariants: `../../rules/gvas-parsing.mdc`
- Parser architecture: `../../rules/parser-pipeline.mdc`
