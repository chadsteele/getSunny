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

  <style>
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
    .download-status small {
      display: block;
      overflow: hidden;
      color: #8e6e3a;
      text-overflow: ellipsis;
      white-space: nowrap;
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
  </style>
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
