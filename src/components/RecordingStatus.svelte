<script lang="ts">
  interface Props {
    elapsedMs: number;
  }

  let { elapsedMs }: Props = $props();

  function formatDuration(milliseconds: number) {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
</script>

<div class="recording-status" aria-live="polite">
  <div class="recording-status-row">
    <span>Recording</span>
    <span>{formatDuration(elapsedMs)} elapsed</span>
  </div>

  <style>
    .recording-status {
      position: absolute;
      right: 3%;
      bottom: 1%;
      z-index: 4;
      width: min(180px, 48%);
      color: #b9934b;
      font-size: 10px;
      letter-spacing: 0.04em;
      pointer-events: none;
    }
    .recording-status-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 5px;
    }
  </style>
</div>
