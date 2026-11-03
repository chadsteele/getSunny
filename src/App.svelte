<script lang="ts">
  import AppShell from './components/AppShell.svelte';
  import AudioControls from './components/AudioControls.svelte';
  import Header from './components/Header.svelte';
  import Sparkle from './components/Sparkle.svelte';

  let isPlaying = false;
  let intensity = 0.18;
  let audioControls: AudioControls;

  function togglePlayback() {
    audioControls?.toggle();
  }
</script>

<svelte:head>
  <title>Sunny — Step 1</title>
</svelte:head>

<AppShell>
  <Header />

  <main class="session-main">
    <p class="eyebrow">A little space for you</p>
    <Sparkle {intensity} {isPlaying} />
  </main>

  <footer class="session-footer">
    <div class="prompt">
      <span class="prompt-kicker">Take a breath</span>
      <span class="prompt-title">Let’s do this!</span>
    </div>
    <AudioControls bind:this={audioControls} bind:isPlaying bind:intensity />
    <button class="audio-upload" type="button" on:click={() => audioControls?.openFilePicker()}>
      <span class="upload-icon">↑</span>
      <span>Add your sound</span>
    </button>
  </footer>
</AppShell>
