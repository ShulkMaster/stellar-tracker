<script lang="ts">
  interface Props {
    label: string;
    value: number;        // 0-100
    max?: number;
    color?: string;       // CSS color for the fill
    height?: number;      // in px
  }

  let {
    label,
    value,
    max = 100,
    color = 'var(--st-accent)',
    height = 14,
  }: Props = $props();

  const percent = $derived(Math.min(Math.max((value / max) * 100, 0), 100));
</script>

<div class="progress-bar-row">
  <div class="progress-label">{label}</div>
  <div class="progress-track" style:height="{height}px">
    <div
      class="progress-fill"
      style:width="{percent}%"
      style:background={color}
    ></div>
  </div>
  <div class="progress-pct">{Math.round(percent)}%</div>
</div>

<style>
  .progress-bar-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.55rem;
  }

  .progress-label {
    width: 110px;
    font-size: 0.9rem;
    color: var(--st-text-muted);
    flex-shrink: 0;
  }

  .progress-track {
    flex: 1;
    background: #1a1f26;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid var(--st-border-subtle);
  }

  .progress-fill {
    height: 100%;
    transition: width 0.3s ease;
    box-shadow: 0 0 6px color-mix(in srgb, var(--st-accent) 50%, transparent);
  }

  .progress-pct {
    width: 42px;
    text-align: right;
    font-family: var(--st-mono);
    font-size: 0.8rem;
    color: var(--st-text);
  }
</style>
