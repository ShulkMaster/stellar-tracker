<script lang="ts">
  import DataTable from './components/DataTable.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import { BinaryReader } from './tracker/binaryReader/BinaryReader';
  import { StreamDecoder } from './tracker/streamDecoder/StreamDecoder';
  import { ProType } from './types/safeFile';
  import type { DataRow } from './types/table';

  let reader = $state<BinaryReader | null>(null);
  let decoder = $state<StreamDecoder | null>(null);
  let tableRows = $state<DataRow[]>([]);
  let isLoading = $state(false);
  let isEOF = $state(false);

  let position = $derived(reader?.position ?? 0);
  let totalSize = $derived(reader?.size ?? 0);

  async function loadFile() {
    isLoading = true;
    try {
      const response = await fetch('/SBS00.sav');
      if (!response.ok) throw new Error(`Failed to load file: ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      reader = new BinaryReader(new Uint8Array(buffer), true);
      decoder = new StreamDecoder(reader);
      tableRows = [...reader.log];
      isEOF = false;
    } catch (e: any) {
      console.error(e);
      alert(e.message);
    } finally {
      isLoading = false;
    }
  }

  function step() {
    if (!decoder || !reader) return;

    try {
      if (reader.position === 0) {
        decoder.decodeHeader();
      } else {
        const prop = decoder.decodeProperty();
        if (prop.name === ProType.None) {
          isEOF = true;
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(`Parsing error: ${e.message}`);
    } finally {
      // Re-assign to trigger Svelte reactivity for the table
      tableRows = [...reader.log];
    }
  }

  function reset() {
    reader = null;
    decoder = null;
    tableRows = [];
    isEOF = false;
  }
</script>

<div class="container py-5">
  <div class="text-center mb-5">
    <h1>Stellar Tracker</h1>
    <p class="text-muted">Save File Debugger & Parser</p>
  </div>

  <div class="row mb-4 justify-content-center">
    <div class="col-md-8 col-lg-6">
      <ControlPanel
        onLoad={loadFile}
        onStep={step}
        onReset={reset}
        canStep={!!reader}
        {isLoading}
        {isEOF}
        {position}
        {totalSize}
      />
    </div>
  </div>

  <div class="row">
    <div class="col">
      <div class="d-flex justify-content-between align-items-end mb-3">
        <h3 class="mb-0">Binary Log</h3>
        <span class="badge bg-info">{tableRows.length} entries</span>
      </div>
      <DataTable rows={tableRows} />
    </div>
  </div>
</div>

<style>
</style>
