<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    hidden?: boolean;
    onMicrophoneLevel: (level: number) => void;
  }

  let { hidden = false, onMicrophoneLevel }: Props = $props();
  let intensity = $state(0.18);
  let scale = $derived(0.06 + intensity * 0.94);
  let glow = $derived(0.02 + intensity * 0.78);
  let microphoneContext: AudioContext | undefined;
  let microphoneAnalyser: AnalyserNode | undefined;
  let microphoneData: Uint8Array<ArrayBuffer> | undefined;
  let microphoneFrame: number | undefined;
  let speakerContext: AudioContext | undefined;
  let speakerAnalyser: AnalyserNode | undefined;
  let speakerSource: MediaElementAudioSourceNode | undefined;
  let speakerData: Uint8Array<ArrayBuffer> | undefined;
  let speakerFrame: number | undefined;

  function level(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const amplitude = (sample - 128) / 128;
      sum += amplitude * amplitude;
    }
    return Math.sqrt(sum / data.length);
  }

  function updateMicrophone() {
    if (!microphoneAnalyser || !microphoneData) return;
    const current = level(microphoneAnalyser, microphoneData);
    onMicrophoneLevel(current);
    intensity = Math.min(0.9, Math.max(0.18, current * 4));
    microphoneFrame = requestAnimationFrame(updateMicrophone);
  }

  export function prepareMicrophone() {
    intensity = 0.45;
  }

  export function stopMicrophone() {
    if (microphoneFrame !== undefined) cancelAnimationFrame(microphoneFrame);
    microphoneFrame = undefined;
    microphoneAnalyser = undefined;
    microphoneData = undefined;
    intensity = 0.18;
    void microphoneContext?.close();
    microphoneContext = undefined;
  }

  export function startMicrophone(stream: MediaStream) {
    if (microphoneAnalyser) return;
    microphoneContext = new AudioContext();
    microphoneAnalyser = microphoneContext.createAnalyser();
    microphoneAnalyser.fftSize = 256;
    microphoneData = new Uint8Array(microphoneAnalyser.fftSize);
    microphoneContext.createMediaStreamSource(stream).connect(microphoneAnalyser);
    microphoneFrame = requestAnimationFrame(updateMicrophone);
  }

  function updateSpeaker() {
    if (!speakerAnalyser || !speakerData) return;
    intensity = Math.min(0.95, Math.max(0.18, level(speakerAnalyser, speakerData) * 7));
    speakerFrame = requestAnimationFrame(updateSpeaker);
  }

  export function startSpeaker(audio: HTMLAudioElement) {
    speakerContext ??= new AudioContext();
    if (!speakerAnalyser) {
      speakerAnalyser = speakerContext.createAnalyser();
      speakerAnalyser.fftSize = 256;
      speakerData = new Uint8Array(speakerAnalyser.fftSize);
      speakerSource ??= speakerContext.createMediaElementSource(audio);
      speakerSource.connect(speakerAnalyser);
      speakerAnalyser.connect(speakerContext.destination);
    }
    void speakerContext.resume();
    if (speakerFrame === undefined) speakerFrame = requestAnimationFrame(updateSpeaker);
  }

  export function stopSpeaker() {
    if (speakerFrame !== undefined) cancelAnimationFrame(speakerFrame);
    speakerFrame = undefined;
    intensity = 0.18;
  }

  onMount(() => () => {
    stopMicrophone();
    stopSpeaker();
    speakerSource?.disconnect();
    speakerAnalyser?.disconnect();
    void speakerContext?.close();
  });
</script>

{#if !hidden}
  <div class="sparkle-stage" style={`--spark-scale: ${scale}; --spark-glow: ${glow}`}>
    <div class="rays rays-wide"></div>
    <div class="rays rays-fine"></div>
    <div class="spark-core">
      <div class="core-halo"></div>
      <div class="core"></div>
    </div>
  </div>
{/if}

<style>
  .sparkle-stage {
    --size: min(78vw, 350px);
    width: var(--size);
    max-width: 100%;
    aspect-ratio: 1;
    position: absolute;
    inset: 18% 0 auto;
    z-index: 3;
    pointer-events: none;
    justify-self: center;
    margin-inline: auto;
    transform: scale(var(--spark-scale));
    transition: transform 160ms ease-out;
    animation: breathe 1.65s ease-in-out infinite;
  }

  .rays,
  .spark-core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
  }

  .rays::before,
  .rays::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(
      from 2deg,
      transparent 0deg 8deg,
      #f2b83f 8.5deg 9deg,
      transparent 9.5deg 17deg
    );
    mask-image: radial-gradient(circle, black 0 18%, transparent 62%);
    opacity: 0.2;
  }

  .rays-fine {
    transform: rotate(12deg) scale(0.8);
    opacity: 0.75;
    filter: blur(0.4px);
  }

  .rays-fine::before {
    background: repeating-conic-gradient(
      from 0deg,
      transparent 0deg 3deg,
      #ffc84e 3.2deg 3.55deg,
      transparent 4deg 9deg
    );
    mask-image: radial-gradient(circle, black 0 16%, transparent 69%);
    opacity: 0.25;
  }

  .rays-wide::after {
    transform: rotate(45deg);
    mask-image: radial-gradient(ellipse, black 0 9%, transparent 54%);
    opacity: 0.42;
  }

  .spark-core {
    display: grid;
    place-items: center;
  }

  .core-halo {
    position: absolute;
    width: 52%;
    aspect-ratio: 1;
    background: #e99e18;
    border-radius: 50%;
    filter: blur(25px);
    opacity: var(--spark-glow);
  }

  .core {
    width: 18%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff9d8;
    box-shadow:
      0 0 12px 6px #fff3a3,
      0 0 35px 20px #ffc844,
      0 0 75px 30px #dc8e16;
  }

  @keyframes breathe {
    0%,
    100% {
      transform: scale(calc(var(--spark-scale) * 0.96));
    }

    50% {
      transform: scale(calc(var(--spark-scale) * 1.07));
    }
  }
</style>
