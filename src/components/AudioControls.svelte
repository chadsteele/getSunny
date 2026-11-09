<script lang="ts">
  export let isPlaying = false;
  export let onToggle: (() => void | Promise<void>) | undefined;

  async function handleToggle() {
    await onToggle?.();
  }
</script>

<button
  class:playing={isPlaying}
  class="play-button"
  type="button"
  aria-label={isPlaying ? 'Pause sound' : 'Play sound'}
  on:click={handleToggle}
>
  {#if isPlaying}
    <span class="pause-icon"><i></i><i></i></span>
  {:else}
    <span class="play-icon"></span>
  {/if}
</button>

<style>
  .play-button {
    width: 37.5px;
    height: 37.5px;
    margin-left: auto;
    flex: 0 0 auto;
    border: 2px solid #e8ad3d;
    border-radius: 50%;
    color: #f5c45b;
    background: #090704;
    box-shadow:
      inset 0 0 13px #9f6519,
      0 0 18px #9a5c14;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }
  .play-button:hover {
    transform: scale(1.05);
    box-shadow:
      inset 0 0 18px #b77723,
      0 0 28px #bc751e;
  }
  .play-button.playing {
    background: #1b1205;
  }
  .pause-icon {
    display: flex;
    gap: 3.5px;
  }
  .pause-icon i {
    width: 4px;
    height: 14.5px;
    border-radius: 1px;
    background: #f2bf57;
    box-shadow: 0 0 8px #e6a52b;
  }
  .play-icon {
    margin-left: 2.5px;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 9.5px solid #f2bf57;
    filter: drop-shadow(0 0 6px #e6a52b);
  }
</style>
