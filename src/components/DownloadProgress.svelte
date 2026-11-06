<script lang="ts">
  interface Props {
    title: string;
    progress: number;
    remainingMs: number;
    status: string;
  }

  let { title, progress, remainingMs, status }: Props = $props();

  function formatDuration(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'estimating...';
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')} remaining`;
  }
</script>

<div class="download-status" aria-live="polite">
  <div class="download-status-row">
    <span>{title}</span>
    <span>{Math.round(progress)}% · {formatDuration(remainingMs)}</span>
  </div>
  <div
    class="download-progress"
    role="progressbar"
    aria-label={`${title} download progress`}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={progress}
  >
    <span style={`width: ${progress}%`}></span>
  </div>
  <small>{status}</small>
</div>
