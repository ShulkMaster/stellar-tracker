<script lang="ts">
  import type { DecodeStepRow } from 'types/table';

  interface Props {
    rows: DecodeStepRow[];
  }

  let { rows = [] }: Props = $props();

  const MAX_VISIBLE = 100;
  let visibleRows = $derived(rows.length > MAX_VISIBLE ? rows.slice(-MAX_VISIBLE) : rows);
  let visibleOffset = $derived(rows.length > MAX_VISIBLE ? rows.length - MAX_VISIBLE : 0);
  let isTruncated = $derived(rows.length > MAX_VISIBLE);

  let scrollEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    const count = rows.length;
    if (count === 0 || scrollEl === null) return;

    requestAnimationFrame(() => {
      scrollEl!.scrollTop = scrollEl!.scrollHeight;
    });
  });

  function stepLabel(row: DecodeStepRow): string {
    switch (row.kind) {
      case 'read':
        return row.opcode;
      case 'tagHeader':
        return 'TagHeader';
      case 'control':
        return row.label;
      case 'yieldName':
        return 'YieldName';
      case 'openStruct':
        return 'OpenStruct';
      case 'openArray':
        return 'OpenArray';
      case 'openMap':
        return 'OpenMap';
      case 'close':
        return 'Close';
      case 'propNone':
        return 'PropNone';
    }
  }

  function stepArgs(row: DecodeStepRow): string {
    switch (row.kind) {
      case 'read':
        return row.index !== undefined ? `${row.args} [${row.index}]` : row.args;
      case 'tagHeader':
        return row.field;
      case 'control':
        return row.detail ?? '';
      case 'yieldName':
        return row.index !== undefined ? `${row.name} [${row.index}]` : row.name;
      case 'openStruct':
        return row.index !== undefined ? `${row.name} [${row.index}]` : row.name;
      case 'openArray':
        return row.count !== undefined ? `${row.name} ×${row.count}` : row.name;
      case 'openMap':
        return row.name;
      case 'close':
        return row.index !== undefined ? `[${row.index}]` : '';
      default:
        return '';
    }
  }

  function formatValue(row: DecodeStepRow): string {
    if (row.kind === 'read' || row.kind === 'tagHeader') {
      if (Array.isArray(row.value)) {
        return row.value.join(', ');
      }
      return String(row.value);
    }
    return '—';
  }

  function rowBytes(row: DecodeStepRow): string {
    if (row.kind === 'read' || row.kind === 'tagHeader') {
      return row.bytes;
    }
    return '—';
  }

  function opcodeClass(row: DecodeStepRow): string {
    switch (row.kind) {
      case 'read':
        switch (row.opcode) {
          case 'FixAscii':
          case 'FieldString':
            return 'opcode--ascii';
          case 'FixInt32':
          case 'FixUint16':
            return 'opcode--int32';
          default:
            return 'opcode--default';
        }
      case 'tagHeader':
        return 'opcode--meta';
      case 'control':
        return 'opcode--control';
      case 'yieldName':
        return 'opcode--name';
      case 'openStruct':
      case 'openArray':
      case 'openMap':
        return 'opcode--container';
      case 'close':
      case 'propNone':
        return 'opcode--control';
    }
  }
</script>

<div class="data-table-wrapper">
  <div class="table-shell">
    <div class="table-scroll" bind:this={scrollEl}>
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th scope="col" class="col-idx">#</th>
            <th scope="col" class="col-opcode">Opcode</th>
            <th scope="col" class="col-args">Args</th>
            <th scope="col" class="col-value">Value</th>
            <th scope="col" class="col-bytes">Bytes</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleRows as row, i (visibleOffset + i)}
            <tr class="step-row">
              <td class="col-idx">
                <span class="row-idx">{visibleOffset + i + 1}</span>
              </td>
              <td class="col-opcode">
                <span class="opcode {opcodeClass(row)}">{stepLabel(row)}</span>
              </td>
              <td class="col-args">
                <span class="mono muted">{stepArgs(row) || '—'}</span>
              </td>
              <td class="col-value">
                <span class="value-text">{formatValue(row)}</span>
              </td>
              <td class="col-bytes">
                <code class="byte-hex">{rowBytes(row)}</code>
              </td>
            </tr>
          {/each}
          {#if rows.length === 0}
            <tr class="empty-row">
              <td colspan="5">
                <div class="empty-state">
                  <span class="empty-icon" aria-hidden="true">⬡</span>
                  <p class="empty-title">No decode steps yet</p>
                  <p class="empty-hint">Load a save file, then click <strong>Next</strong> to decode one opcode at a time.</p>
                </div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  {#if rows.length > 0}
    <p class="table-meta">
      {#if isTruncated}
        showing last {MAX_VISIBLE} of {rows.length} steps
      {:else}
        {rows.length} step{rows.length === 1 ? '' : 's'}
      {/if}
    </p>
  {/if}
</div>

<style>
  .data-table-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    min-height: 0;
    max-height: 800px;
  }

  .table-shell {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--st-bg-elevated);
    border: 1px solid var(--st-border);
    border-radius: var(--st-radius);
    box-shadow: var(--st-shadow);
    overflow: hidden;
  }

  .table-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .table {
    font-size: 0.875rem;
    margin: 0;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--st-bg-surface);
    color: var(--st-text-subtle);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--st-border);
    white-space: nowrap;
    box-shadow: 0 1px 0 var(--st-border);
  }

  tbody td {
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--st-border-subtle);
    vertical-align: middle;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  .col-idx {
    width: 3rem;
    text-align: center;
  }

  .col-opcode {
    width: 8rem;
  }

  .col-args {
    width: 5rem;
  }

  .col-value {
    min-width: 8rem;
  }

  .col-bytes {
    width: 40%;
  }

  .row-idx {
    font-family: var(--st-mono);
    font-size: 0.75rem;
    color: var(--st-text-subtle);
  }

  .opcode {
    display: inline-block;
    font-family: var(--st-mono);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.55rem;
    border-radius: var(--st-radius-sm);
    border: 1px solid transparent;
  }

  .opcode--ascii {
    background: rgba(163, 113, 247, 0.12);
    border-color: rgba(163, 113, 247, 0.3);
    color: #bc8cff;
  }

  .opcode--int32 {
    background: rgba(88, 166, 255, 0.12);
    border-color: rgba(88, 166, 255, 0.3);
    color: #79c0ff;
  }

  .opcode--default {
    background: var(--st-bg-surface);
    border-color: var(--st-border);
    color: var(--st-text-muted);
  }

  .opcode--name {
    background: rgba(63, 185, 80, 0.12);
    border-color: rgba(63, 185, 80, 0.3);
    color: #56d364;
  }

  .opcode--container {
    background: rgba(210, 153, 34, 0.12);
    border-color: rgba(210, 153, 34, 0.3);
    color: #e3b341;
  }

  .opcode--control {
    background: rgba(248, 81, 73, 0.12);
    border-color: rgba(248, 81, 73, 0.3);
    color: #ff7b72;
  }

  .opcode--meta {
    background: rgba(139, 148, 158, 0.1);
    border-color: rgba(139, 148, 158, 0.25);
    color: var(--st-text-subtle);
  }

  .mono {
    font-family: var(--st-mono);
    font-size: 0.8rem;
  }

  .muted {
    color: var(--st-text-muted);
  }

  .value-text {
    font-family: var(--st-mono);
    font-size: 0.85rem;
    color: var(--st-text);
    word-break: break-all;
  }

  .byte-hex {
    font-family: var(--st-mono);
    font-size: 0.78rem;
    color: #ff7b72;
    background: rgba(255, 123, 114, 0.08);
    padding: 0.2rem 0.45rem;
    border-radius: 4px;
    word-break: break-all;
    white-space: normal;
  }

  .empty-row td {
    padding: 0;
    border: none;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3.5rem 1.5rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 2rem;
    color: var(--st-text-subtle);
    opacity: 0.5;
    margin-bottom: 0.75rem;
  }

  .empty-title {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--st-text-muted);
  }

  .empty-hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--st-text-subtle);
    max-width: 28rem;
    line-height: 1.5;
  }

  .empty-hint strong {
    color: var(--st-success);
    font-weight: 600;
  }

  .table-meta {
    margin: 0;
    font-size: 0.75rem;
    color: var(--st-text-subtle);
    font-family: var(--st-mono);
    text-align: right;
  }
</style>
