<script lang="ts">
  import { onMount } from 'svelte';
  import { normalizeForDisplay, normalizeForSpeech, splitSentences } from '../lib/speech-text';
  import { logger as console } from '../lib/logger';
  import { CachedPiperVoiceProvider, type VoiceDownloadProgress } from '../lib/piper-voice-cache';

  interface Props {
    muted: boolean;
    onSpeakingSentence?: (sentence: string) => void;
    onSpeakingEnd?: () => void;
    onIntensityChange?: (intensity: number) => void;
    onDownloadProgress?: (progress: VoiceDownloadProgress | null) => void;
    onError?: (error: unknown) => void;
  }

  type PiperEngine = {
    generate: (text: string, voice: string, speaker?: number) => Promise<{ file: Blob }>;
    destroy: () => void;
  };

  let {
    muted,
    onSpeakingSentence,
    onSpeakingEnd,
    onIntensityChange,
    onDownloadProgress,
    onError,
  }: Props = $props();

  let audio: HTMLAudioElement | undefined;
  let audioUrl: string | undefined;
  let audioContext: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let audioSource: MediaElementAudioSourceNode | undefined;
  let audioData: Uint8Array<ArrayBuffer> | undefined;
  let animationFrame: number | undefined;
  let engine: PiperEngine | undefined;
  let enginePromise: Promise<PiperEngine> | undefined;
  let loadPhonemizer: (() => Promise<unknown>) | undefined;
  let preloadPromise: Promise<void> | undefined;
  let speechQueue = Promise.resolve();
  let cancelled = false;
  let playbackVersion = 0;
  let pendingPlaybackResolve: (() => void) | undefined;
  let playbackUnlocked = false;
  const voice = 'en_US-libritts_r-medium';

  function getEngine() {
    enginePromise ??= import('piper-tts-web')
      .then(({ PiperWebEngine, PhonemizeWebRuntime }) => {
        const assetUrls = new Set<string>();
        const phonemizer = new PhonemizeWebRuntime({
          provider: {
            async fetch(url) {
              async function readAsset(assetUrl: string) {
                const response = await fetch(assetUrl, { cache: 'no-store' });
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                const blob = await response.blob();
                if (!blob.size) throw new Error('Empty asset response');
                return blob;
              }
              let blob: Blob;
              try {
                blob = await readAsset(url);
              } catch (error) {
                console.warn(
                  `[Sunny] Piper asset ${url} failed; retrying with a fresh URL:`,
                  error,
                );
                const retryUrl = new URL(url, window.location.href);
                retryUrl.searchParams.set('retry', crypto.randomUUID());
                try {
                  blob = await readAsset(retryUrl.href);
                } catch (retryError) {
                  throw new Error(`Unable to load Piper asset ${url}`, { cause: retryError });
                }
              }
              const assetUrl = URL.createObjectURL(blob);
              assetUrls.add(assetUrl);
              return assetUrl;
            },
            destroy() {
              for (const url of assetUrls) URL.revokeObjectURL(url);
              assetUrls.clear();
            },
          },
        });
        loadPhonemizer = () => phonemizer.loadModule();
        const nextEngine = new PiperWebEngine({
          phonemizeRuntime: phonemizer,
          voiceProvider: new CachedPiperVoiceProvider((progress) => onDownloadProgress?.(progress)),
        });
        engine = nextEngine;
        return nextEngine;
      })
      .catch((error: unknown) => {
        enginePromise = undefined;
        throw error;
      });
    return enginePromise;
  }

  async function preload() {
    try {
      await getEngine();
      console.log('[Sunny] Piper engine ready');
    } catch (error) {
      console.error('[Sunny] Piper preload failed:', error);
      onError?.(error);
    }
  }

  function ensurePreload() {
    preloadPromise ??= preload();
    return preloadPromise;
  }

  function generateSpeech(text: string) {
    console.log(`[Sunny]  ${text}`);
    return getEngine()
      .then(async (nextEngine) => {
        if (!loadPhonemizer) throw new Error('Piper phonemizer is not initialized.');
        await loadPhonemizer();
        return nextEngine.generate(text, voice);
      })
      .then(({ file }) => file)
      .catch((error: unknown) => {
        engine?.destroy();
        engine = undefined;
        enginePromise = undefined;
        loadPhonemizer = undefined;
        throw error;
      });
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
    blobPromise: Promise<Blob>,
    requestVersion: number,
    onReady?: () => void,
  ) {
    if (muted || requestVersion !== playbackVersion) return;
    const blob = await blobPromise;
    if (muted || requestVersion !== playbackVersion) return;
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
        audio!.onerror = () => reject(new Error('Piper audio playback failed.'));
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
    speechQueue = speechQueue
      .then(() => {
        if (requestVersion !== playbackVersion) return;
        return ensurePreload().then(() => {
          if (requestVersion !== playbackVersion) return;
          return playSentence(displaySentence, generateSpeech(sentence), requestVersion, onReady);
        });
      })
      .catch((error: unknown) => {
        console.error('[Sunny] Piper playback failed:', error);
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
    cancelled = true;
    speechQueue = Promise.resolve();
    pendingPlaybackResolve?.();
    pendingPlaybackResolve = undefined;
    audio?.pause();
    onSpeakingEnd?.();
    stopVisualizer();
  }

  onMount(() => {
    void ensurePreload();
    document.addEventListener('pointerdown', unlockPlayback, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', unlockPlayback);
      stop();
      audioSource?.disconnect();
      analyser?.disconnect();
      void audioContext?.close();
      engine?.destroy();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  });
</script>
