<script lang="ts">
  interface Props {
    onLoad: () => void;
    onStep: () => void;
    onStepToClose: () => void;
    onReset: () => void;
    canStep: boolean;
    isLoading: boolean;
    isEOF: boolean;
    position: number;
    totalSize: number;
  }

  let {
    onLoad,
    onStep,
    onStepToClose,
    onReset,
    canStep,
    isLoading,
    isEOF,
    position,
    totalSize,
  }: Props = $props();

  let progress = $derived(totalSize > 0 ? (position / totalSize) * 100 : 0);

  function formatBytes(n: number): string {
    if (n === 0) return '0 B';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
</script>

<div class="panel card shadow-sm">
  <div class="panel-top">
    <div class="panel-heading">
      <h2 class="panel-title">Controls</h2>
      {#if canStep || isEOF}
        <p class="panel-desc">Step through the decode program one opcode at a time.</p>
      {:else}
        <p class="panel-desc">Load a save file to begin stream decoding.</p>
      {/if}
    </div>

    <div class="panel-actions">
      {#if !canStep && !isEOF}
        <button class="btn btn-primary btn-action" onclick={onLoad} disabled={isLoading}>
          {#if isLoading}
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Loading…
          {:else}
            Load SBS00.sav
          {/if}
        </button>
      {:else}
        <button class="btn btn-success btn-action" onclick={onStep} disabled={isEOF}>
          {#if isEOF}
            Finished
          {:else}
            Next →
          {/if}
        </button>
        <button
          class="btn btn-outline-success btn-action"
          onclick={onStepToClose}
          disabled={isEOF}
          title="Step until the next Close or PropNone"
        >
          Next close ⤓
        </button>
        <button class="btn btn-outline-danger btn-action" onclick={onReset}>
          Reset
        </button>
      {/if}
    </div>
  </div>

  {#if canStep || isEOF}
    <div class="panel-stats">
      <div class="stat">
        <span class="stat-label">Offset</span>
        <span class="stat-value">{formatBytes(position)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">File size</span>
        <span class="stat-value">{formatBytes(totalSize)}</span>
      </div>
      <div class="stat stat--wide">
        <div class="stat-row">
          <span class="stat-label">Progress</span>
          <span class="stat-value stat-value--mono">{progress.toFixed(4)}%</span>
        </div>
        <div class="progress">
          <div
            class="progress-bar"
            role="progressbar"
            style="width: {progress}%"
            aria-valuenow={progress}
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
      </div>
    </div>
  {/if}

  {#if isEOF}
    <div class="alert alert-info panel-alert" role="status">
      Program buffer empty — no more steps.
    </div>
  {/if}
</div>

<style>
  .panel {
    padding: 1.25rem 1.5rem;
    box-shadow: var(--st-shadow) !important;
  }

  .panel-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .panel-heading {
    flex: 1;
    min-width: 200px;
  }

  .panel-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .panel-desc {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
    color: var(--st-text-muted);
    line-height: 1.45;
  }

  .panel-actions {
    display: flex;
    gap: 0.625rem;
    flex-shrink: 0;
  }

  .btn-action {
    padding: 0.5rem 1.1rem;
    border-radius: var(--st-radius-sm);
    font-size: 0.875rem;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .panel-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.875rem;
    margin-top: 1.25rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--st-border-subtle);
  }

  @media (max-width: 640px) {
    .panel-stats {
      grid-template-columns: 1fr;
    }
  }

  .stat {
    background: var(--st-bg-surface);
    border: 1px solid var(--st-border-subtle);
    border-radius: var(--st-radius-sm);
    padding: 0.75rem 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat--wide {
    grid-column: span 1;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }

  .stat-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--st-text-subtle);
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--st-text);
  }

  .stat-value--mono {
    font-family: var(--st-mono);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--st-accent);
  }

  .stat .progress {
    height: 6px;
  }

  .panel-alert {
    margin-top: 1rem;
    margin-bottom: 0;
    padding: 0.65rem 0.875rem;
    font-size: 0.85rem;
  }
</style>
