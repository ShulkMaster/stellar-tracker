<script lang="ts">
  /**
   * DataTable component for displaying stream decoder steps.
   * Features:
   * - Incremental building support
   * - Pagination (max 100 rows per page)
   * - Autoscroll/auto-navigate to the last page on data updates
   */
  import type { DecodeStepRow } from '../types/table';

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

  function formatValue(val: string | number | number[]): string {
    if (Array.isArray(val)) {
      return val.join(', ');
    }
    return String(val);
  }
</script>

<div class="data-table-wrapper mb-4">
  <div class="table-responsive shadow-sm rounded border">
    <table class="table table-striped table-hover table-sm align-middle mb-0">
      <thead class="table-dark">
        <tr>
          <th scope="col" style="width: 15%;">Opcode</th>
          <th scope="col" style="width: 15%;">Args</th>
          <th scope="col" style="width: 30%;">Value</th>
          <th scope="col" style="width: 40%;">Bytes</th>
        </tr>
      </thead>
      <tbody>
        {#each displayedRows as row, i (startIndex + i)}
          <tr>
            <td>
              <span class="badge bg-secondary font-monospace">{row.opcode}</span>
            </td>
            <td>
              <span class="font-monospace">{row.args}</span>
            </td>
            <td>
              <span class="value-text">{formatValue(row.value)}</span>
            </td>
            <td class="byte-data">
              <code>{row.bytes}</code>
            </td>
          </tr>
        {/each}
        {#if rows.length === 0}
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <div class="d-flex flex-column align-items-center">
                <span>No decode steps yet — load a file and click Next</span>
              </div>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  {#if totalPages > 1}
    <nav aria-label="Table pagination" class="mt-3">
      <ul class="pagination pagination-sm justify-content-center flex-wrap">
        <li class="page-item" class:disabled={currentPage === 1}>
          <button class="page-link" onclick={() => goToPage(1)} title="First Page">
            &laquo;&laquo;
          </button>
        </li>
        <li class="page-item" class:disabled={currentPage === 1}>
          <button class="page-link" onclick={() => goToPage(currentPage - 1)} title="Previous Page">
            &laquo;
          </button>
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
          <button class="page-link" onclick={() => goToPage(currentPage + 1)} title="Next Page">
            &raquo;
          </button>
        </li>
        <li class="page-item" class:disabled={currentPage === totalPages}>
          <button class="page-link" onclick={() => goToPage(totalPages)} title="Last Page">
            &raquo;&raquo;
          </button>
        </li>
      </ul>
      <div class="text-center text-muted x-small">
        Page {currentPage} of {totalPages} &bull; Items {startIndex + 1} to {endIndex} of {rows.length}
      </div>
    </nav>
  {/if}
</div>

<style>
  .font-monospace {
    font-family: var(--bs-font-monospace);
  }

  .value-text {
    word-break: break-all;
  }

  .byte-data {
    font-family: var(--bs-font-monospace);
    font-size: 0.75rem;
    word-break: break-all;
    max-width: 0;
    width: 40%;
  }

  .table {
    font-size: 0.85rem;
  }

  .x-small {
    font-size: 0.7rem;
  }

  .badge {
    font-size: 0.7rem;
    padding: 0.35em 0.65em;
  }
</style>
