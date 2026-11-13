<script lang="ts">
  import { onMount } from 'svelte';
  import { normalizeForDisplay, normalizeForSpeech, splitSentences } from '../lib/speech-text';
  import { logger as console } from '../lib/logger';

  interface Props {
    muted: boolean;
    onSpeakingSentence?: (sentence: string) => void;
    onSpeakingEnd?: () => void;
    onIntensityChange?: (intensity: number) => void;
    onError?: (error: unknown) => void;
  }

  let { muted, onSpeakingSentence, onSpeakingEnd, onIntensityChange, onError }: Props = $props();

  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let audioContext: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let audioSource: MediaElementAudioSourceNode | undefined;
  let audioData: Uint8Array<ArrayBuffer> | undefined;
  let animationFrame: number | undefined;
  let speechQueue = Promise.resolve();
  let cancelled = false;
  let playbackVersion = 0;
  let pendingPlaybackResolve: (() => void) | undefined;
  let playbackUnlocked = false;
  type SpeechResult = { blob: Blob } | { error: unknown };
  type SpeechJob = {
    sentence: string;
    controller: AbortController;
    result?: Promise<SpeechResult>;
  };
  let speechJobs: SpeechJob[] = [];

  async function generateSpeech(text: string, signal: AbortSignal) {
    console.log(`[Sunny]  ${text}`);
    const response = await fetch('/.netlify/functions/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Speech synthesis failed (${response.status}): ${body}`);
    }
    return response.blob();
  }

  function prefetchSpeech() {
    for (const job of speechJobs.slice(0, 2)) {
      job.result ??= generateSpeech(job.sentence, job.controller.signal).then(
        (blob): SpeechResult => ({ blob }),
        (error: unknown): SpeechResult => ({ error }),
      );
    }
  }

  function cancelSpeechJobs() {
    for (const job of speechJobs) job.controller.abort();
    speechJobs = [];
  }

  function updateIntensity() {
    if (!analyser || !audioData) {
      animationFrame = undefined;
      onIntensityChange?.(0.18);
      return;
    }
    analyser.getByteTimeDomainData(audioData);
    let sum = 0;
    for (const sample of audioData) {
      const amplitude = (sample - 128) / 128;
      sum += amplitude * amplitude;
    }
    const level = Math.sqrt(sum / audioData.length);
    onIntensityChange?.(Math.min(0.95, Math.max(0.18, level * 7)));
    animationFrame = requestAnimationFrame(updateIntensity);
  }

  function startVisualizer() {
    if (!audio) return;
    audioContext ??= new AudioContext();
    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioData = new Uint8Array(analyser.fftSize);
      audioSource ??= audioContext.createMediaElementSource(audio);
      audioSource.connect(analyser);
      analyser.connect(audioContext.destination);
    }
    void audioContext.resume();
    if (animationFrame === undefined) {
      animationFrame = requestAnimationFrame(updateIntensity);
    }
  }

  function stopVisualizer() {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
    onIntensityChange?.(0.18);
  }

  function unlockPlayback() {
    playbackUnlocked = true;
    if (!pendingPlaybackResolve || !audio) return;
    const resolve = pendingPlaybackResolve;
    void audio
      .play()
      .then(() => {
        pendingPlaybackResolve = undefined;
        resolve();
      })
      .catch(() => {
        // Keep waiting for a later user gesture if the browser still blocks playback.
      });
  }

  async function playSentence(
    text: string,
    job: SpeechJob,
    requestVersion: number,
    onReady?: () => void,
  ) {
    if (muted || requestVersion !== playbackVersion) return;
    if (!job.result) throw new Error('Speech request was not started.');
    const result = await job.result;
    if (muted || requestVersion !== playbackVersion) return;
    if ('error' in result) throw result.error;
    const { blob } = result;
    cancelled = false;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);
    audio ??= new Audio();
    audio.src = audioUrl;
    audio.muted = muted;
    onReady?.();
    onSpeakingSentence?.(text);
    startVisualizer();
    try {
      try {
        await audio.play();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
        let playbackStarted = false;
        if (playbackUnlocked) {
          try {
            await audio.play();
            playbackStarted = true;
          } catch {
            // Continue waiting for a user gesture if the earlier gesture did not unlock playback.
          }
        }
        if (!playbackStarted) {
          await new Promise<void>((resolve) => {
            pendingPlaybackResolve = resolve;
          });
        }
        if (muted || requestVersion !== playbackVersion) return;
        await audio.play();
      }
      await new Promise<void>((resolve, reject) => {
        audio!.onended = () => resolve();
        audio!.onerror = () => reject(new Error('Speech audio playback failed.'));
        audio!.onpause = () => {
          if (cancelled) resolve();
        };
      });
    } finally {
      onSpeakingEnd?.();
      stopVisualizer();
    }
  }

  function queueSentence(text: string, onReady?: () => void) {
    const displaySentence = normalizeForDisplay(text);
    const sentence = normalizeForSpeech(text);
    if (!displaySentence || !sentence || muted) return;
    const requestVersion = playbackVersion;
    const job: SpeechJob = { sentence, controller: new AbortController() };
    speechJobs.push(job);
    prefetchSpeech();
    speechQueue = speechQueue
      .then(() => {
        if (requestVersion !== playbackVersion) return;
        return playSentence(displaySentence, job, requestVersion, onReady);
      })
      .then(() => {
        if (requestVersion !== playbackVersion) return;
        speechJobs.shift();
        prefetchSpeech();
      })
      .catch((error: unknown) => {
        if (requestVersion !== playbackVersion) return;
        playbackVersion += 1;
        cancelSpeechJobs();
        console.error('[Sunny] Speech playback failed:', error);
        onError?.(error);
      });
  }

  export function speak(text: string, onReady?: () => void) {
    const { sentences, remaining } = splitSentences(text);
    let notified = false;
    const notifyReady = () => {
      if (notified) return;
      notified = true;
      onReady?.();
    };
    sentences.forEach((sentence) => queueSentence(sentence, notifyReady));
    if (remaining.trim()) queueSentence(remaining, notifyReady);
    return speechQueue;
  }

  export function stop() {
    playbackVersion += 1;
    cancelSpeechJobs();
    cancelled = true;
    speechQueue = Promise.resolve();
    pendingPlaybackResolve?.();
    pendingPlaybackResolve = undefined;
    audio?.pause();
    onSpeakingEnd?.();
    stopVisualizer();
  }

  onMount(() => {
    document.addEventListener('pointerdown', unlockPlayback, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', unlockPlayback);
      stop();
      audioSource?.disconnect();
      analyser?.disconnect();
      void audioContext?.close();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  });
</script>
