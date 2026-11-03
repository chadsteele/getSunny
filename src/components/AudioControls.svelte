<script lang="ts">
  import { onDestroy } from 'svelte';

  export let isPlaying = false;
  export let intensity = 0.18;
  export let onToggle: (() => void | Promise<void>) | undefined;

  let audioElement: HTMLAudioElement;
  let fileInput: HTMLInputElement;
  let audioContext: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let mediaSource: MediaElementAudioSourceNode | undefined;
  let oscillator: OscillatorNode | undefined;
  let gain: GainNode | undefined;
  let animationFrame = 0;
  let sourceUrl = '';
  let customAudio = false;
  let data: Uint8Array<ArrayBuffer>;

  function openFilePicker() {
    fileInput?.click();
  }

  function animate() {
    if (!analyser || !data) return;
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length / 255;
    intensity = Math.min(1, Math.max(0.1, average * 2.4));
    animationFrame = requestAnimationFrame(animate);
  }

  async function toggle() {
    if (!audioContext) {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      data = new Uint8Array(analyser.frequencyBinCount);
    }

    if (isPlaying) {
      if (customAudio) {
        audioElement.pause();
      } else {
        oscillator?.stop();
        oscillator = undefined;
      }
      isPlaying = false;
      cancelAnimationFrame(animationFrame);
      intensity = 0.18;
      return;
    }

    await audioContext.resume();
    const activeAnalyser = analyser;
    if (!activeAnalyser) return;

    if (customAudio) {
      mediaSource ??= audioContext.createMediaElementSource(audioElement);
      mediaSource.connect(activeAnalyser);
      activeAnalyser.connect(audioContext.destination);
      await audioElement.play();
    } else {
      oscillator = audioContext.createOscillator();
      gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 196;
      gain.gain.value = 0.045;
      oscillator.connect(gain);
      gain.connect(activeAnalyser);
      activeAnalyser.connect(audioContext.destination);
      oscillator.start();
    }

    isPlaying = true;
    animate();
  }

  async function handleToggle() {
    if (onToggle) {
      await onToggle();
      return;
    }
    await toggle();
  }

  function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    customAudio = true;
    if (audioElement) audioElement.src = sourceUrl;
  }

  onDestroy(() => {
    cancelAnimationFrame(animationFrame);
    oscillator?.stop();
    audioContext?.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  });

  export { openFilePicker, toggle };
</script>

<input bind:this={fileInput} class="visually-hidden" type="file" accept="audio/*" on:change={handleFile} />
<audio bind:this={audioElement} class="visually-hidden" src={sourceUrl}></audio>

<button class:playing={isPlaying} class="play-button" type="button" aria-label={isPlaying ? 'Pause sound' : 'Play sound'} on:click={handleToggle}>
  {#if isPlaying}
    <span class="pause-icon"><i></i><i></i></span>
  {:else}
    <span class="play-icon"></span>
  {/if}
</button>
