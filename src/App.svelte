<script lang="ts">
  import DataTable from './components/DataTable.svelte';
  import TrackerView from './components/TrackerView.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import { BinaryReader } from './tracker/binaryReader/BinaryReader';
  import { StreamDecoder } from './tracker/streamDecoder/StreamDecoder';
  import type { DataRow } from './types/table';

  let jsonData = $state<any>({});
  let tableRows = $state<DataRow[]>([]);
  let isLoading = $state(false);

  async function loadFile() {
    isLoading = true;
    try {
      const response = await fetch('/SBS00.sav');
      if (!response.ok) throw new Error(`Failed to load file: ${response.statusText}`);
      const buffer = await response.bytes();
      const reader = new BinaryReader(buffer, true);
      const decoder = new StreamDecoder(reader);

      jsonData = decoder.decode();
      tableRows = [...reader.log];
    } catch (e: any) {
      console.error(e);
      alert(e.message);
    } finally {
      isLoading = false;
    }
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
        onStep={() => {}}
        onReset={() => {}}
        canStep={false}
        {isLoading}
        isEOF={false}
        position={0}
        totalSize={0}
      />
    </div>
  </div>

  {#if jsonData.header}
    <div class="row mb-4">
      <div class="col-12">
        <TrackerView saveFile={jsonData} />
      </div>
    </div>
  {/if}

  <div class="row g-4">
    <div class="col-12">
      <div class="d-flex justify-content-between align-items-end mb-3">
        <h3 class="mb-0">Assembled JSON</h3>
        <button
                class="btn btn-sm btn-outline-secondary"
                onclick={() => {
            const json = JSON.stringify(jsonData, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2);
            navigator.clipboard.writeText(json);
          }}
        >
          Copy JSON
        </button>
      </div>
      <div class="json-output-wrapper border rounded bg-light">
        <pre class="p-3 m-0">
          <code>{JSON.stringify(jsonData, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}</code>
        </pre>
      </div>
    </div>
    <div class="col-12">
      <div class="d-flex justify-content-between align-items-end mb-3">
        <h3 class="mb-0">Binary Log</h3>
        <span class="badge bg-info">{tableRows.length} entries</span>
      </div>
      <DataTable rows={tableRows} />
    </div>
  </div>
</div>

<style>
  .json-output-wrapper {
    max-height: 800px;
    overflow: auto;
  }
  
  .json-output-wrapper pre {
    font-size: 0.8rem;
    white-space: pre;
  }
</style>
