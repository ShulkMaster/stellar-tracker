<script lang="ts">
  interface Props {
    onLoad: () => void;
    onStep: () => void;
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
    onReset, 
    canStep, 
    isLoading, 
    isEOF, 
    position, 
    totalSize 
  }: Props = $props();

  let progress = $derived(totalSize > 0 ? (position / totalSize) * 100 : 0);
</script>

<div class="card p-4 shadow-sm mb-4">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h5 class="mb-0">Control Panel</h5>
    <div class="text-muted small">
      {position} / {totalSize} bytes ({progress.toFixed(2)}%)
    </div>
  </div>

  <div class="progress mb-3" style="height: 10px;">
    <div 
      class="progress-bar" 
      role="progressbar" 
      style="width: {progress}%" 
      aria-valuenow={progress} 
      aria-valuemin="0" 
      aria-valuemax="100"
    ></div>
  </div>

  <div class="d-grid gap-2 d-md-flex justify-content-md-start">
    {#if !canStep && !isEOF}
      <button class="btn btn-primary" onclick={onLoad} disabled={isLoading}>
        {#if isLoading}
          <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          Loading...
        {:else}
          Load SBS00.sav
        {/if}
      </button>
    {:else}
      <button class="btn btn-success" onclick={onStep} disabled={isEOF}>
        {isEOF ? 'Finished' : 'Next'}
      </button>
      <button class="btn btn-outline-danger" onclick={onReset}>
        Reset
      </button>
    {/if}
  </div>

  {#if isEOF}
    <div class="alert alert-info mt-3 mb-0 py-2 small">
      Program buffer empty — no more steps.
    </div>
  {/if}
</div>
