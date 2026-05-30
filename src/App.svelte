<script lang="ts">
  import { onMount } from 'svelte';
  import DataTable from './components/DataTable.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import JsonViewer from './components/JsonViewer.svelte';
  import { BinaryReader, StreamDecoder, StreamAssembler } from 'tracker';
  import type { DecodeStepRow } from './types/table';
  import { safeStringify } from './lib/safeStringify';

  let decoder = $state<StreamDecoder | null>(null);
  let assembler = $state<StreamAssembler | null>(null);
  let tableRows = $state<DecodeStepRow[]>([]);
  let jsonOutput = $state<string>('{}');
  let fileLoaded = $state(false);
  let isLoading = $state(false);
  let position = $state(0);
  let totalSize = $state(0);
  let canAdvance = $state(false);
  let isFinished = $state(false);
  let iterDepth = $state(0);
  let iterKind = $state<'arrayIter' | 'mapIter' | null>(null);

  // Safety cap so a malformed stream can never freeze the tab while skipping
  // through a runaway iteration. Largest in-the-wild container in `SBS00.sav`
  // is well under this, so the cap should never fire on legitimate input.
  const SKIP_STEP_LIMIT = 200_000;

  let stepCount = $derived(tableRows.length);

  function refreshJson() {
    if (!assembler) {
      jsonOutput = '{}';
      return;
    }
    jsonOutput = safeStringify(assembler.header);
  }

  function syncDecoderState() {
    if (decoder === null) {
      position = 0;
      totalSize = 0;
      canAdvance = false;
      isFinished = false;
      iterDepth = 0;
      iterKind = null;
      return;
    }
    position = decoder.position;
    totalSize = decoder.totalSize;
    canAdvance = decoder.canStep;
    isFinished = fileLoaded && !decoder.canStep;
    iterDepth = decoder.framesDepth;
    iterKind = decoder.currentIterKind;
  }

  async function loadFile() {
    isLoading = true;
    try {
      const response = await fetch('/SBS00.sav');
      if (!response.ok) throw new Error(`Failed to load file: ${response.statusText}`);
      const buffer = await response.bytes();
      const reader = new BinaryReader(new Uint8Array(buffer));
      const nextDecoder = new StreamDecoder(reader);
      decoder = nextDecoder;
      assembler = new StreamAssembler(nextDecoder);
      tableRows = [];
      fileLoaded = true;
      refreshJson();
      syncDecoderState();
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      isLoading = false;
    }
  }

  function step() {
    if (!assembler || !decoder?.canStep) return;
    const row = assembler.step();
    if (row === null) return;
    tableRows = [...tableRows, row];
    refreshJson();
    syncDecoderState();
  }

  function stepToClose() {
    if (!assembler || !decoder?.canStep) return;
    const collected: DecodeStepRow[] = [];
    while (decoder.canStep) {
      const row = assembler.step();
      if (row === null) break;
      collected.push(row);
      if (row.kind === 'close' || row.kind === 'propNone') break;
    }
    tableRows = [...tableRows, ...collected];
    refreshJson();
    syncDecoderState();
  }

  /**
   * Fast-forward through every remaining element of the *innermost* active
   * array/map iteration (and emit its tear-down `close`). No-op when the
   * decoder isn't currently inside an `arrayIter` / `mapIter` frame.
   * Bounded by `SKIP_STEP_LIMIT` so a runaway stream can't freeze the tab.
   */
  function stepToIterEnd() {
    if (!assembler || !decoder?.canStep) return;
    const targetDepth = decoder.framesDepth;
    if (targetDepth === 0) return;
    const collected: DecodeStepRow[] = [];
    let i = 0;
    while (decoder.canStep && decoder.framesDepth >= targetDepth && i < SKIP_STEP_LIMIT) {
      const row = assembler.step();
      if (row === null) break;
      collected.push(row);
      i++;
    }
    if (i === SKIP_STEP_LIMIT) {
      console.warn(`stepToIterEnd: hit safety cap of ${SKIP_STEP_LIMIT} steps`);
    }
    tableRows = [...tableRows, ...collected];
    refreshJson();
    syncDecoderState();
  }

  function reset() {
    if (!decoder) return;
    decoder.reset();
    assembler = new StreamAssembler(decoder);
    tableRows = [];
    refreshJson();
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
        <img class="app-logo" src="/logo.svg" alt="Stellar Blade Tracker" width="40" height="40" aria-hidden="true" />
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
      onStepToIterEnd={stepToIterEnd}
      onReset={reset}
      canStep={fileLoaded}
      {isLoading}
      isEOF={isFinished}
      {position}
      {totalSize}
      {iterDepth}
      {iterKind}
    />

    <section class="workbench">
      <div class="pane pane--steps">
        <div class="section-header">
          <h2 class="section-title">Decode Steps</h2>
          <span class="entry-count">{stepCount}</span>
        </div>
        <DataTable rows={tableRows} />
      </div>

      <div class="pane pane--json">
        <div class="section-header">
          <h2 class="section-title">Assembled JSON</h2>
          <span class="entry-count">live</span>
        </div>
        <JsonViewer value={jsonOutput} />
      </div>
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
    max-width: 1600px;
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
    width: 2.5rem;
    height: 2.5rem;
    display: block;
    filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.25));
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
    max-width: 1600px;
    margin: 0 auto;
    padding: 1.75rem 1.5rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.25rem;
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 1100px) {
    .workbench {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .pane {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 600px;
    min-width: 0;
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
