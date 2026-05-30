<script lang="ts">
  /**
   * Main Tracker container.
   * Owns the high-level state for the parser experience.
   * This will eventually receive real save data via props.
   */
  import RegionFilter from './components/nav/RegionFilter.svelte';
  import HomeDashboard from './components/home/HomeDashboard.svelte';
  import type { TopCategory } from './types';

  interface Props {
    activeTab?: TopCategory;
  }

  let { activeTab = 'overview' }: Props = $props();

  let selectedRegions = $state<Region[]>([]);
  let showMissingOnly = $state(false);

  function toggleRegion(region: Region) {
    if (selectedRegions.includes(region)) {
      selectedRegions = selectedRegions.filter(r => r !== region);
    } else {
      selectedRegions = [...selectedRegions, region];
    }
  }

  function clearRegions() {
    selectedRegions = [];
  }
</script>

<div class="tracker-root">
  <RegionFilter
    selected={selectedRegions}
    onToggle={toggleRegion}
    onClear={clearRegions}
  />

  <div class="tracker-body">
    {#if activeTab === 'overview'}
      <HomeDashboard />

    {:else if activeTab === 'collectibles'}
      <div>
        <h2>Collectibles</h2>
        <p style="color: var(--st-text-subtle);">
          Cans, Memory Sticks, Fish, etc. will live here (region filter applies).
        </p>
      </div>

    {:else if activeTab === 'progression'}
      <div>
        <h2>Progression (Skills)</h2>
        <p style="color: var(--st-text-subtle);">
          Ability Tree and other progression systems (not affected by region filter).
        </p>
      </div>

    {:else if activeTab === 'appearance'}
      <div>
        <h2>Appearance</h2>
        <p style="color: var(--st-text-subtle);">Nanosuits, Hair, Accessories, etc.</p>
      </div>

    {:else if activeTab === 'combat'}
      <div>
        <h2>Combat</h2>
        <p style="color: var(--st-text-subtle);">Exospines, Gear, Bosses, etc.</p>
      </div>

    {:else}
      <div>
        <h2>{activeTab}</h2>
        <p style="color: var(--st-text-subtle);">Content coming soon.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .tracker-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--st-bg);
  }

  .tracker-body {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }
</style>
