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
</div>
