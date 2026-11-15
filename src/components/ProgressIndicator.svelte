<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    status: string;
    showProgress: boolean;
    speakerControl: Snippet;
    microphoneControl: Snippet;
  }

  let { title, status, showProgress, speakerControl, microphoneControl }: Props = $props();
  const maxWaitingMs = 60_000;
  let progress = $state(0);
  let remainingMs = $state(maxWaitingMs);

  $effect(() => {
    if (!showProgress) {
      progress = 0;
      remainingMs = maxWaitingMs;
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.min(maxWaitingMs, Date.now() - startedAt);
      progress = (elapsed / maxWaitingMs) * 100;
      remainingMs = maxWaitingMs - elapsed;
    }, 100);
    return () => clearInterval(timer);
  });

  function formatDuration(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '';
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')} remaining`;
  }
</script>

<footer class="session-footer">
  {#if showProgress}
    <div class="progress-area">
      <div class="download-status" aria-live="polite">
        <div class="download-status-row">
          <span>{title}</span>
          <span
            >{Math.round(progress)}%{remainingMs > 0
              ? ` · ${formatDuration(remainingMs)}`
              : ''}</span
          >
        </div>

        <div
          class="download-progress"
          role="progressbar"
          aria-label={title}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progress}
        >
          <span style={`width: ${progress}%`}></span>
        </div>
      </div>
    </div>
  {/if}
  <div class="control-row">
    {@render speakerControl()}
    <div class="status-area" aria-live="polite">{status}</div>
    {@render microphoneControl()}
  </div>
</footer>

<style>
  .session-footer {
    position: relative;
    flex: 0 0 auto;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 10px;
    background: #020202e6;
  }
  .progress-area {
    width: 100%;
  }
  .control-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  .status-area {
    flex: 1 1 auto;
    min-width: 0;
    color: #b9934b;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .download-status {
    flex: 1;
    min-width: 0;
    color: #b9934b;
    font-size: 10px;
    letter-spacing: 0.04em;
  }
  .download-status-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }
  .download-progress {
    width: 100%;
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: #3a2810;
    box-shadow: inset 0 0 4px #0a0703;
  }
  .download-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #efb64d;
    box-shadow: 0 0 8px #e6a52b;
    transition: width 0.25s linear;
  }
  @media (min-width: 600px) {
    .session-footer {
      padding: 0 2px;
    }
  }
</style>
