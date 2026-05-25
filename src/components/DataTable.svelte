<script lang="ts">
  import type { DecodeStepRow } from '../types/table';
  import { isReadStep } from '../types/table';

  interface Props {
    rows: DecodeStepRow[];
  }

  let { rows = [] }: Props = $props();

  const pageSize = 100;
  let currentPage = $state(1);

  let totalPages = $derived(Math.ceil(rows.length / pageSize) || 1);
  let startIndex = $derived((currentPage - 1) * pageSize);
  let endIndex = $derived(Math.min(startIndex + pageSize, rows.length));
  let displayedRows = $derived(rows.slice(startIndex, endIndex));

  $effect(() => {
    if (rows.length > 0) {
      currentPage = totalPages;
    }
  });

  function goToPage(page: number) {
    currentPage = Math.max(1, Math.min(page, totalPages));
  }

  function stepLabel(row: DecodeStepRow): string {
    switch (row.kind) {
      case 'read':
        return row.opcode;
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
        return row.args;
      case 'yieldName':
      case 'openStruct':
      case 'openArray':
      case 'openMap':
        return row.name;
      default:
        return '';
    }
  }

  function formatValue(row: DecodeStepRow): string {
    if (!isReadStep(row)) {
      return '—';
    }
    if (Array.isArray(row.value)) {
      return row.value.join(', ');
    }
    return String(row.value);
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
          case 'DummyI32':
            return 'opcode--dummy';
          default:
            return 'opcode--default';
        }
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
        {#each displayedRows as row, i (startIndex + i)}
          <tr class="step-row">
            <td class="col-idx">
              <span class="row-idx">{startIndex + i + 1}</span>
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
              <code class="byte-hex">{isReadStep(row) ? row.bytes : '—'}</code>
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

  {#if totalPages > 1}
    <nav aria-label="Table pagination" class="pagination-nav">
      <ul class="pagination pagination-sm justify-content-center flex-wrap mb-0">
        <li class="page-item" class:disabled={currentPage === 1}>
          <button class="page-link" onclick={() => goToPage(1)} title="First Page">««</button>
        </li>
        <li class="page-item" class:disabled={currentPage === 1}>
          <button class="page-link" onclick={() => goToPage(currentPage - 1)} title="Previous Page">«</button>
        </li>

        {#each Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
          if (totalPages <= 7) return i + 1;
          let start = Math.max(1, currentPage - 3);
          let end = Math.min(totalPages, start + 6);
          if (end === totalPages) start = Math.max(1, end - 6);
          return start + i;
        }) as p}
          <li class="page-item" class:active={currentPage === p}>
            <button class="page-link" onclick={() => goToPage(p)}>{p}</button>
          </li>
        {/each}

        <li class="page-item" class:disabled={currentPage === totalPages}>
          <button class="page-link" onclick={() => goToPage(currentPage + 1)} title="Next Page">»</button>
        </li>
        <li class="page-item" class:disabled={currentPage === totalPages}>
          <button class="page-link" onclick={() => goToPage(totalPages)} title="Last Page">»»</button>
        </li>
      </ul>
      <p class="pagination-meta">
        Page {currentPage} of {totalPages} · items {startIndex + 1}–{endIndex} of {rows.length}
      </p>
    </nav>
  {/if}
</div>

<style>
  .data-table-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .table-shell {
    background: var(--st-bg-elevated);
    border: 1px solid var(--st-border);
    border-radius: var(--st-radius);
    overflow: hidden;
    box-shadow: var(--st-shadow);
  }

  .table {
    font-size: 0.875rem;
    margin: 0;
  }

  thead th {
    background: var(--st-bg-surface);
    color: var(--st-text-subtle);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--st-border);
    white-space: nowrap;
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

  .opcode--dummy {
    background: rgba(210, 153, 34, 0.12);
    border-color: rgba(210, 153, 34, 0.3);
    color: #e3b341;
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

  .pagination-nav {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .pagination-meta {
    margin: 0;
    font-size: 0.75rem;
    color: var(--st-text-subtle);
    font-family: var(--st-mono);
  }
</style>
