<script lang="ts">
  import { onMount } from 'svelte';
  import DataTable from './components/DataTable.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import { BinaryReader, StreamDecoder } from 'tracker';
  import type { DecodeStepRow } from './types/table';

  let decoder = $state<StreamDecoder | null>(null);
  let tableRows = $state<DecodeStepRow[]>([]);
  let fileLoaded = $state(false);
  let isLoading = $state(false);
  let position = $state(0);
  let totalSize = $state(0);
  let canAdvance = $state(false);
  let isFinished = $state(false);

  let stepCount = $derived(tableRows.length);

  function syncDecoderState() {
    if (decoder === null) {
      position = 0;
      totalSize = 0;
      canAdvance = false;
      isFinished = false;
      return;
    }
    position = decoder.position;
    totalSize = decoder.totalSize;
    canAdvance = decoder.canStep;
    isFinished = fileLoaded && !decoder.canStep;
  }

  async function loadFile() {
    isLoading = true;
    try {
      const response = await fetch('/SBS00.sav');
      if (!response.ok) throw new Error(`Failed to load file: ${response.statusText}`);
      const buffer = await response.bytes();
      const reader = new BinaryReader(new Uint8Array(buffer));
      decoder = new StreamDecoder(reader);
      tableRows = [];
      fileLoaded = true;
      syncDecoderState();
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      isLoading = false;
    }
  }

  function step() {
    if (!decoder?.canStep) return;
    tableRows = [...tableRows, decoder.next()];
    syncDecoderState();
  }

  function stepToClose() {
    if (!decoder?.canStep) return;
    const collected: DecodeStepRow[] = [];
    while (decoder.canStep) {
      const row = decoder.next();
      collected.push(row);
      if (row.kind === 'close' || row.kind === 'propNone') break;
    }
    tableRows = [...tableRows, ...collected];
    syncDecoderState();
  }

  function reset() {
    decoder?.reset();
    tableRows = [];
    syncDecoderState();
  }

  onMount(() => {
    void loadFile();
  });
</script>

<div class="app">
  <header class="app-header">
    <div class="app-header-inner">
      <div class="app-brand">
        <span class="app-logo" aria-hidden="true">◈</span>
        <div>
          <h1 class="app-title">Stellar Tracker</h1>
          <p class="app-subtitle">Save file stream decoder</p>
        </div>
      </div>
      {#if fileLoaded}
        <div class="app-status">
          <span class="status-pill" class:status-pill--done={isFinished} class:status-pill--active={canAdvance}>
            {#if isFinished}
              Complete
            {:else if canAdvance}
              Ready
            {:else}
              Loaded
            {/if}
          </span>
          <span class="status-meta">{stepCount} step{stepCount === 1 ? '' : 's'}</span>
        </div>
      {/if}
    </div>
  </header>

  <main class="app-main">
    <ControlPanel
      onLoad={loadFile}
      onStep={step}
      onStepToClose={stepToClose}
      onReset={reset}
      canStep={fileLoaded}
      {isLoading}
      isEOF={isFinished}
      {position}
      {totalSize}
    />

    <section class="steps-section">
      <div class="section-header">
        <h2 class="section-title">Decode Steps</h2>
        <span class="entry-count">{stepCount}</span>
      </div>
      <DataTable rows={tableRows} />
    </section>
  </main>
</div>

<style>
  .app {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(ellipse 80% 50% at 50% -20%, rgba(88, 166, 255, 0.08), transparent),
      var(--st-bg);
  }

  .app-header {
    border-bottom: 1px solid var(--st-border-subtle);
    background: rgba(22, 27, 34, 0.8);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .app-header-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.25rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .app-brand {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .app-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--st-radius-sm);
    background: linear-gradient(135deg, var(--st-accent-dim), var(--st-bg-surface));
    border: 1px solid rgba(88, 166, 255, 0.25);
    color: var(--st-accent);
    font-size: 1.1rem;
  }

  .app-title {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .app-subtitle {
    margin: 0.15rem 0 0;
    font-size: 0.85rem;
    color: var(--st-text-muted);
  }

  .app-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .status-pill {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    background: var(--st-bg-surface);
    border: 1px solid var(--st-border);
    color: var(--st-text-muted);
  }

  .status-pill--active {
    background: var(--st-success-dim);
    border-color: rgba(63, 185, 80, 0.35);
    color: var(--st-success);
  }

  .status-pill--done {
    background: var(--st-accent-dim);
    border-color: rgba(88, 166, 255, 0.35);
    color: var(--st-accent);
  }

  .status-meta {
    font-size: 0.8rem;
    color: var(--st-text-subtle);
    font-family: var(--st-mono);
  }

  .app-main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.75rem 1.5rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .steps-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--st-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .entry-count {
    font-family: var(--st-mono);
    font-size: 0.8rem;
    color: var(--st-text-subtle);
    background: var(--st-bg-surface);
    border: 1px solid var(--st-border-subtle);
    padding: 0.2rem 0.55rem;
    border-radius: var(--st-radius-sm);
  }
</style>
