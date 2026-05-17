<script lang="ts">
  import { ProType } from '../types/safeFile';

  let { saveFile } = $props<{ saveFile: any }>();

  let newGameCreateTime = $derived(saveFile?.body?.['NewGameCreateTime']?.value);
  let actors = $derived(saveFile?.body?.['DataMap_SBActor']?.value || {});

  function formatFileTime(fileTime: bigint) {
    if (!fileTime) return 'N/A';
    // Windows FileTime is 100ns intervals since 1601-01-01
    const unixEpoch = 11644473600000n; // ms between 1601 and 1970
    const ms = (fileTime / 10000n) - unixEpoch;
    return new Date(Number(ms)).toLocaleString();
  }
</script>

<div class="card shadow-sm mb-4">
  <div class="card-header bg-primary text-white">
    <h5 class="mb-0">Stellar Tracker - Key Data</h5>
  </div>
  <div class="card-body">
    <div class="row mb-3">
      <div class="col-md-4 font-weight-bold">New Game Created:</div>
      <div class="col-md-8 text-primary font-weight-bold">
        {formatFileTime(newGameCreateTime)}
      </div>
    </div>
    
    <div class="row">
      <div class="col-12">
        <h6>Actors in DataMap_SBActor ({Object.keys(actors).length})</h6>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-sm table-hover border">
            <thead class="bg-light sticky-top">
              <tr>
                <th>Actor Name</th>
                <th>Location</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {#each Object.entries(actors) as [name, actor]}
                <tr>
                  <td><code>{name}</code></td>
                  <td>
                    {#if actor.value?.ActorLocation}
                      X: {actor.value.ActorLocation.value.x.toFixed(2)}, 
                      Y: {actor.value.ActorLocation.value.y.toFixed(2)}, 
                      Z: {actor.value.ActorLocation.value.z.toFixed(2)}
                    {:else}
                      <span class="text-muted">N/A</span>
                    {/if}
                  </td>
                  <td>
                    <button class="btn btn-xs btn-outline-info py-0" style="font-size: 0.7rem;" 
                            onclick={() => console.log(actor)}>
                      Log Details
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .btn-xs {
    padding: 1px 5px;
    font-size: 12px;
    line-height: 1.5;
    border-radius: 3px;
  }
  .sticky-top {
    position: sticky;
    top: 0;
    z-index: 10;
  }
</style>
