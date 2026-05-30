<script lang="ts">
  import ProgressBar from '../../../../components/ProgressBar.svelte';

  // TODO: These will come from real computed data later
  const progress = {
    cans: 79,
    outfits: 64,
    exospines: 85,
    fish: 47,
    memory: 38,
  };
</script>

<div class="home-dashboard">
  <h2>Recovery Overview</h2>

  <div class="bars">
    <ProgressBar label="Cans" value={progress.cans} color="var(--st-accent)" />
    <ProgressBar label="Outfits & Nanosuits" value={progress.outfits} color="#a371f7" />
    <ProgressBar label="Exospines & Gear" value={progress.exospines} color="var(--st-success)" />
    <ProgressBar label="Fish Journal" value={progress.fish} color="#e07b39" />
    <ProgressBar label="Memory Sticks" value={progress.memory} color="#7b5cff" />
  </div>

  <p style="margin-top: 1rem; color: var(--st-text-subtle); font-size: 0.9rem;">
    These bars will be driven by real save data in the next phase.
  </p>
</div>

<style>
  .home-dashboard h2 {
    margin: 0 0 1rem;
    font-size: 1.2rem;
  }
</style>
