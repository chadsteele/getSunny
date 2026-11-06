<script lang="ts">
  interface Props {
    progress: number;
    remainingMs: number;
  }

  let { progress, remainingMs }: Props = $props();

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
    <span>{formatDuration(remainingMs)} remaining</span>
  </div>
  <div
    class="recording-progress"
    role="progressbar"
    aria-label="Recording time elapsed"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={progress}
  >
    <span style={`width: ${progress}%`}></span>
  </div>
</div>
