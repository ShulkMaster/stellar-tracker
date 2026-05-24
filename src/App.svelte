<script lang="ts">
  import DataTable from './components/DataTable.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import { BinaryReader } from './tracker/binaryReader/BinaryReader';
  import { StreamDecoder } from './tracker/streamDecoder/StreamDecoder';
  import type { DecodeStepRow } from './types/table';

  let decoder = $state<StreamDecoder | null>(null);
  let tableRows = $state<DecodeStepRow[]>([]);
  let fileLoaded = $state(false);
  let isLoading = $state(false);

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
  }

  function reset() {
    decoder?.reset();
    tableRows = [];
  }
</script>

<div class="container-fluid px-4 py-5">
  <div class="text-center mb-5">
    <h1>Stellar Tracker</h1>
    <p class="text-muted">Save File Debugger & Parser</p>
  </div>

  <div class="row mb-4 justify-content-center">
    <div class="col-xl-6 col-lg-8 col-md-10">
      <ControlPanel
        onLoad={loadFile}
        onStep={step}
        onReset={reset}
        canStep={fileLoaded}
        {isLoading}
        isEOF={fileLoaded && decoder !== null && !decoder.canStep}
        position={decoder?.position ?? 0}
        totalSize={decoder?.totalSize ?? 0}
      />
    </div>
  </div>

  <div class="row g-4">
    <div class="col-12">
      <div class="d-flex justify-content-between align-items-end mb-3">
        <h3 class="mb-0">Decode Steps</h3>
        <span class="badge bg-info">{tableRows.length} entries</span>
      </div>
      <DataTable rows={tableRows} />
    </div>
  </div>
</div>
