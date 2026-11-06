<script lang="ts">
  export let isPlaying = false;
  export let onToggle: (() => void | Promise<void>) | undefined;

  async function handleToggle() {
    await onToggle?.();
  }
</script>

<button class:playing={isPlaying} class="play-button" type="button" aria-label={isPlaying ? 'Pause sound' : 'Play sound'} on:click={handleToggle}>
  {#if isPlaying}
    <span class="pause-icon"><i></i><i></i></span>
  {:else}
    <span class="play-icon"></span>
  {/if}
</button>
