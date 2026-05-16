<script lang="ts">
  /**
   * DataTable component for displaying decoded save file properties.
   * Features:
   * - Incremental building support
   * - Pagination (max 100 rows per page)
   * - Autoscroll/auto-navigate to the last page on data updates
   * - Support for string, number, and object values (with JSON formatting)
   */
  import type { DataRow } from '../types/table';

  interface Props {
    rows: DataRow[];
  }

  let { rows = [] }: Props = $props();

  const pageSize = 100;
  let currentPage = $state(1);

  let totalPages = $derived(Math.ceil(rows.length / pageSize) || 1);
  let startIndex = $derived((currentPage - 1) * pageSize);
  let endIndex = $derived(Math.min(startIndex + pageSize, rows.length));
  let displayedRows = $derived(rows.slice(startIndex, endIndex));

  // Stick to last page when rows change
  $effect(() => {
    if (rows.length > 0) {
      // Accessing rows.length creates a dependency
      // We want to move to the last page whenever the total number of items grows
      currentPage = totalPages;
    }
  });

  function goToPage(page: number) {
    currentPage = Math.max(1, Math.min(page, totalPages));
  }

  function formatValue(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val, (_, value) =>
          typeof value === 'bigint' ? value.toString() + 'n' : value
        , 2);
      } catch (e) {
        return String(val);
      }
    }
    return String(val);
  }
</script>

<div class="data-table-wrapper mb-4">
  <div class="table-responsive shadow-sm rounded border">
    <table class="table table-striped table-hover table-sm align-middle mb-0">
      <thead class="table-dark">
        <tr>
          <th scope="col" style="width: 15%;">Type</th>
          <th scope="col" style="width: 40%;">Value</th>
          <th scope="col" style="width: 15%;">Byte Range</th>
          <th scope="col" style="width: 30%;">Byte Data (ASCII)</th>
        </tr>
      </thead>
      <tbody>
        {#each displayedRows as row, i (startIndex + i)}
          <tr>
            <td>
              <span class="badge bg-secondary font-monospace">{row.type}</span>
            </td>
            <td>
              {#if typeof row.value === 'object'}
                <div class="json-value">
                  <pre class="m-0 p-1"><code>{formatValue(row.value)}</code></pre>
                </div>
              {:else}
                <span class="value-text">{row.value}</span>
              {/if}
            </td>
            <td>
              <small class="text-muted font-monospace">{row.byteRange}</small>
            </td>
            <td class="byte-data">
              <code>{row.byteData}</code>
            </td>
          </tr>
        {/each}
        {#if rows.length === 0}
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <div class="d-flex flex-column align-items-center">
                <span>No data entries found</span>
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
  
  .json-value pre {
    max-height: 120px;
    overflow-y: auto;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
    font-size: 0.75rem;
    line-height: 1.2;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .value-text {
    word-break: break-all;
  }

  .byte-data {
    font-family: var(--bs-font-monospace);
    font-size: 0.75rem;
    word-break: break-all;
    max-width: 0; /* Allows cell to shrink and use word-break */
    width: 30%;
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

  /* Custom scrollbar for JSON pre */
  .json-value pre::-webkit-scrollbar {
    width: 4px;
  }
  .json-value pre::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 4px;
  }
</style>
