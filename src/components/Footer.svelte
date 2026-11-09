<script lang="ts">
  import AudioControls from './AudioControls.svelte';
  import DownloadProgress from './DownloadProgress.svelte';

  interface Props {
    modelsReady: boolean;
    activeModelDownload: boolean;
    downloadingModel: string;
    downloadProgress: number;
    downloadRemainingMs: number;
    downloadStatus: string;
    isPlaying: boolean;
    onToggle: () => void | Promise<void>;
  }

  let {
    modelsReady,
    activeModelDownload,
    downloadingModel,
    downloadProgress,
    downloadRemainingMs,
    downloadStatus,
    isPlaying,
    onToggle,
  }: Props = $props();
</script>

<footer class="session-footer">
  {#if !modelsReady || activeModelDownload}
    <DownloadProgress
      title={downloadingModel}
      progress={downloadProgress}
      remainingMs={downloadRemainingMs}
      status={downloadStatus}
    />
  {/if}
  <AudioControls {isPlaying} {onToggle} />
</footer>

<style>
  .session-footer {
    position: relative;
    flex: 0 0 auto;
    z-index: 5;
    display: flex;
    align-items: end;
    justify-content: flex-start;
    gap: 18px;
    padding-top: 10px;
    background: #020202e6;
  }
  @media (min-width: 600px) {
    .session-footer {
      padding: 0 2px;
    }
  }
</style>
