<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';

  interface Props {
    value: string;
  }

  let { value }: Props = $props();

  type Range = {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  type Position = { lineNumber: number; column: number };
  type EditOp = { range: Range; text: string; forceMoveMarkers?: boolean };
  type Model = {
    getValue: () => string;
    setValue: (v: string) => void;
    getPositionAt: (offset: number) => Position;
    applyEdits: (edits: EditOp[]) => void;
    getLineCount: () => number;
    getLineMaxColumn: (line: number) => number;
  };
  type Editor = {
    getModel: () => Model | null;
    setValue: (v: string) => void;
    dispose: () => void;
  };
  type MonacoGlobal = {
    editor: { create: (el: HTMLElement, opts: Record<string, unknown>) => Editor };
  };

  let container = $state<HTMLDivElement | null>(null);
  let editor: Editor | null = null;
  let isReady = $state(false);
  let loadError = $state<string | null>(null);

  /**
   * Apply minimal edits to the model so Monaco's folding/cursor/scroll
   * state for unchanged regions is preserved across updates. We compute
   * the longest common prefix and suffix between old and new text and
   * replace only the middle range.
   */
  function applyIncrementalEdit(model: Model, nextText: string): void {
    const prevText = model.getValue();
    if (prevText === nextText) return;

    const minLen = Math.min(prevText.length, nextText.length);

    let prefix = 0;
    while (prefix < minLen && prevText.charCodeAt(prefix) === nextText.charCodeAt(prefix)) {
      prefix++;
    }

    let suffix = 0;
    const maxSuffix = minLen - prefix;
    while (
      suffix < maxSuffix &&
      prevText.charCodeAt(prevText.length - 1 - suffix) ===
        nextText.charCodeAt(nextText.length - 1 - suffix)
    ) {
      suffix++;
    }

    const oldStart = prefix;
    const oldEnd = prevText.length - suffix;
    const replacement = nextText.slice(prefix, nextText.length - suffix);

    if (oldStart === oldEnd && replacement.length === 0) return;

    const startPos = model.getPositionAt(oldStart);
    const endPos = model.getPositionAt(oldEnd);

    model.applyEdits([
      {
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        text: replacement,
        forceMoveMarkers: false,
      },
    ]);
  }

  onMount(async () => {
    try {
      const w = window as unknown as { __monacoReady?: Promise<MonacoGlobal> };
      if (!w.__monacoReady) {
        throw new Error('Monaco CDN loader not present in index.html');
      }
      const monaco = await w.__monacoReady;
      if (!container) return;
      editor = monaco.editor.create(container, {
        value,
        language: 'json',
        theme: 'vs-dark',
        readOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        folding: true,
        foldingStrategy: 'indentation',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        fontSize: 12,
        renderLineHighlight: 'none',
        smoothScrolling: true,
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
      });
      isReady = true;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  });

  onDestroy(() => {
    editor?.dispose();
    editor = null;
  });

  $effect(() => {
    const next = value;
    if (!isReady) return;
    untrack(() => {
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;
      applyIncrementalEdit(model, next);
    });
  });
</script>

<div class="json-viewer-wrap">
  {#if loadError}
    <div class="json-error">
      Monaco failed to load: {loadError}
    </div>
  {/if}
  <div class="json-viewer" bind:this={container}></div>
</div>

<style>
  .json-viewer-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    max-height: 800px;
    background: var(--st-bg-elevated);
    border: 1px solid var(--st-border);
    border-radius: var(--st-radius);
    box-shadow: var(--st-shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .json-viewer {
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .json-error {
    padding: 0.75rem 1rem;
    color: var(--st-danger);
    background: rgba(248, 81, 73, 0.08);
    border-bottom: 1px solid rgba(248, 81, 73, 0.3);
    font-size: 0.85rem;
    font-family: var(--st-mono);
  }
</style>
