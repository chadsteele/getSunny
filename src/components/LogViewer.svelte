<script lang="ts">
  import { tick } from 'svelte';
  import { logEntries } from '../lib/logger';

  let logView: HTMLDivElement | undefined;

  $effect(() => {
    const count = $logEntries.length;
    void count;
    void tick().then(() => logView?.scrollTo({ top: logView.scrollHeight, behavior: 'smooth' }));
  });
</script>

<div class="log-view" bind:this={logView} aria-label="Application logs" role="log">
  {#if $logEntries.length === 0}
    <p>No logs yet.</p>
  {:else}
    {#each $logEntries as entry (entry.id)}
      <div
        class="log-entry"
        class:error={entry.level === 'error'}
        class:warning={entry.level === 'warn'}
      >
        <span>{entry.timestamp} [{entry.level.toUpperCase()}]</span>
        <div>{entry.message}</div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .log-view {
    position: relative;
    z-index: 4;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 8px;
    color: #f3cf82;
    font: 12px/1.5 monospace;
    overflow-wrap: anywhere;
    user-select: text;
    -webkit-user-select: text;
  }
  .log-entry {
    padding: 6px 0;
    border-bottom: 1px solid #5b3e16;
    white-space: pre-wrap;
  }
  .log-entry span {
    color: #b9934b;
  }
  .log-entry.error {
    color: #ff9a79;
  }
  .log-entry.warning {
    color: #ffe2a3;
  }
</style>
