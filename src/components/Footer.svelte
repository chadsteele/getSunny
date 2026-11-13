<script lang="ts">
  import DownloadProgress from './DownloadProgress.svelte';

  interface Props {
    downloadingModel: string;
    downloadProgress: number;
    downloadRemainingMs: number;
    downloadStatus: string;
    indeterminate: boolean;
    showProgress: boolean;
    microphoneMuted: boolean;
    speakerMuted: boolean;
    onToggleMicrophone: () => void | Promise<void>;
    onToggleSpeaker: () => void;
  }

  let {
    downloadingModel,
    downloadProgress,
    downloadRemainingMs,
    downloadStatus,
    indeterminate,
    showProgress,
    microphoneMuted,
    speakerMuted,
    onToggleMicrophone,
    onToggleSpeaker,
  }: Props = $props();
</script>

<footer class="session-footer">
  {#if showProgress}
    <div class="progress-area">
      <DownloadProgress
        title={downloadingModel}
        progress={downloadProgress}
        remainingMs={downloadRemainingMs}
        {indeterminate}
      />
    </div>
  {/if}
  <div class="control-row">
    <button
      class:muted={speakerMuted}
      class="mute-button speaker-button"
      type="button"
      aria-label={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
      aria-pressed={speakerMuted}
      onclick={onToggleSpeaker}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
        {#if !speakerMuted}
          <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11" />
        {:else}
          <path class="slash" d="m4 4 16 16" />
        {/if}
      </svg>
    </button>
    <div class="status-area" aria-live="polite">{downloadStatus}</div>
    <button
      class:muted={microphoneMuted}
      class="mute-button microphone-button"
      type="button"
      aria-label={microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
      aria-pressed={microphoneMuted}
      onclick={onToggleMicrophone}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
        {#if microphoneMuted}<path class="slash" d="m4 4 16 16" />{/if}
      </svg>
    </button>
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
    display: flex;
    flex: 1 1 auto;
    justify-content: center;
    min-width: 0;
    overflow: hidden;
    color: #b9934b;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mute-button {
    width: 56.25px;
    height: 56.25px;
    flex: 0 0 56.25px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid #5b3e16;
    border-radius: 50%;
    color: #eeb64e;
    background: #090704;
    font: inherit;
    cursor: pointer;
    box-shadow:
      inset 0 0 10px #6f4512,
      0 0 12px #6b3f12;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }
  .mute-button:hover,
  .mute-button:focus-visible {
    border-color: #e8ad3d;
    color: #fff0bd;
    transform: scale(1.05);
    box-shadow:
      inset 0 0 15px #9f6519,
      0 0 18px #9a5c14;
  }
  .mute-button.muted {
    border-color: #8e3e2d;
    color: #ff9a79;
  }
  .mute-button svg {
    width: 28.5px;
    height: 28.5px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
  .mute-button .slash {
    stroke-width: 2.2;
  }
  @media (min-width: 600px) {
    .session-footer {
      padding: 0 2px;
    }
  }
</style>
