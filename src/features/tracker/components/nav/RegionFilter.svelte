<script lang="ts">
  import { REGIONS, type Region } from '../../constants';

  interface Props {
    selected: Region[];
    onToggle: (region: Region) => void;
    onClear: () => void;
  }

  let { selected, onToggle, onClear }: Props = $props();

  // Short display names for the chips (no emojis - images will be added later)
  const REGION_SHORT: Record<Region, string> = {
    'Eidos 7': 'Eidos 7',
    'Xion': 'Xion',
    'Wasteland': 'Wasteland',
    'Altess Levoire': 'Altess Levoire',
    'Matrix 11': 'Matrix 11',
    'Great Desert': 'Great Desert',
    'Abyss Levoire': 'Abyss Levoire',
    'Eidos 9': 'Eidos 9',
    'Spire 4': 'Spire 4',
    'Nest': 'Nest',
  };
</script>

<div class="region-filter">
  <div class="region-label">Regions</div>

  <div class="region-chips">
    <!-- Global / All -->
    <button
      class="region-chip global"
      class:active={selected.length === 0}
      onclick={onClear}
    >
      <span class="chip-name">All Regions</span>
    </button>

    {#each REGIONS as region}
      <button
        class="region-chip"
        class:active={selected.includes(region)}
        onclick={() => onToggle(region)}
      >
        <span class="chip-name">{REGION_SHORT[region]}</span>
      </button>
    {/each}
  </div>

  {#if selected.length > 0}
    <div class="region-summary">
      Filtering {selected.length} region{selected.length > 1 ? 's' : ''}
      <button class="clear-btn" onclick={onClear}>Clear</button>
    </div>
  {/if}
</div>

<style>
  .region-filter {
    padding: 0.5rem 1rem;
    background: var(--st-bg-surface);
    border-bottom: 1px solid var(--st-border-subtle);
  }

  .region-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-subtle);
    margin-bottom: 0.3rem;
  }

  .region-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .region-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.6rem;
    background: var(--st-bg-elevated);
    border: 1px solid var(--st-border);
    border-radius: 999px;
    font-size: 0.8rem;
    color: var(--st-text);
    cursor: pointer;
  }

  .region-chip.active {
    background: var(--st-accent-dim);
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .region-chip.global.active {
    background: rgba(88, 166, 255, 0.15);
  }

  .chip-name {
    font-weight: 500;
  }

  .region-summary {
    margin-top: 0.3rem;
    font-size: 0.75rem;
    color: var(--st-text-muted);
  }

  .clear-btn {
    margin-left: 0.4rem;
    font-size: 0.75rem;
    color: var(--st-accent);
    background: none;
    border: none;
    cursor: pointer;
  }
</style>
