<script lang="ts">
  import type { TopCategory } from '../../types';

  interface Props {
    active: TopCategory;
    onChange: (cat: TopCategory) => void;
  }

  let { active, onChange }: Props = $props();

  const categories: { key: TopCategory; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'collectibles', label: 'Collectibles' },
    { key: 'progression', label: 'Progression' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'combat', label: 'Combat' },
  ];
</script>

<nav class="tracker-top-nav">
  {#each categories as cat}
    <button
      class="nav-tab"
      class:active={active === cat.key}
      onclick={() => onChange(cat.key)}
    >
      {cat.label}
    </button>
  {/each}

  <!-- Special tabs -->
  <div class="nav-divider"></div>

  <button
    class="nav-tab special"
    class:active={active === 'progression'}  /* temporary until we map Skills properly */
    onclick={() => onChange('progression')}
  >
    Skills
  </button>

  <button
    class="nav-tab dev"
    onclick={() => alert('Dev tab will be wired in the next step')}
  >
    Dev
  </button>
</nav>

<style>
  .tracker-top-nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 1rem;
    background: var(--st-bg-elevated);
    border-bottom: 1px solid var(--st-border-subtle);
    flex-shrink: 0;
  }

  .nav-tab {
    padding: 0.35rem 0.85rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--st-text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .nav-tab:hover {
    color: var(--st-text);
    background: var(--st-bg-surface);
  }

  .nav-tab.active {
    background: var(--st-accent-dim);
    color: var(--st-accent);
  }

  .nav-tab.special {
    color: var(--st-success);
  }

  .nav-tab.dev {
    color: #d4a017;
    margin-left: auto;
  }

  .nav-divider {
    width: 1px;
    height: 18px;
    background: var(--st-border-subtle);
    margin: 0 0.5rem;
  }
</style>
