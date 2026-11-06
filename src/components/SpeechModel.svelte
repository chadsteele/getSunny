<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    download as downloadPiperVoice,
    stored as storedPiperVoices,
  } from '@realtimex/piper-tts-web';
  import { logger as console } from '../lib/logger';
  import type { ModelConfig } from '../lib/model-config';
  import { normalizeForSpeech } from '../lib/speech-text';

  interface Props {
    config: ModelConfig;
    wasmPaths: {
      onnxWasm: string;
      piperData: string;
      piperWasm: string;
    };
    onProgress: (progress: number) => void;
    onDownloadStateChange: (state: string) => void;
    onDownloaded: () => void;
  }

  let { config, wasmPaths, onProgress, onDownloadStateChange, onDownloaded }: Props = $props();
  let worker: Worker | undefined;
  let nextRequestId = 0;
  const pendingRequests = new Map<number, {
    resolve: (audio: Blob) => void;
    reject: (error: Error) => void;
  }>();

  function initializeWorker() {
    if (worker) return Promise.resolve();
    worker = new Worker(new URL('../workers/tts.worker.ts', import.meta.url), { type: 'module' });
    const workerReady = new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          worker?.removeEventListener('message', handleMessage);
          resolve();
        } else if (event.data.type === 'error' && event.data.requestId === undefined) {
          worker?.removeEventListener('message', handleMessage);
          reject(new Error(event.data.error));
        }
      };
      worker?.addEventListener('message', handleMessage);
    });
    worker.addEventListener('message', (event: MessageEvent) => {
      const { requestId } = event.data;
      if (typeof requestId !== 'number') return;
      const pending = pendingRequests.get(requestId);
      if (!pending) return;
      pendingRequests.delete(requestId);
      if (event.data.type === 'result') pending.resolve(event.data.audio as Blob);
      else pending.reject(new Error(event.data.error));
    });
    worker.postMessage({
      type: 'init',
      voiceId: config.name,
      wasmPaths: {
        onnxWasm: wasmPaths.onnxWasm,
        piperData: wasmPaths.piperData,
        piperWasm: wasmPaths.piperWasm,
      },
    });
    return workerReady;
  }

  onDestroy(() => {
    worker?.terminate();
    worker = undefined;
    for (const { reject } of pendingRequests.values()) {
      reject(new Error('Piper TTS worker stopped.'));
    }
    pendingRequests.clear();
  });

  export async function prepare() {
    const prepareStartedAt = performance.now();
    console.log('[Sunny] Piper prepare started:', {
      voice: config.name,
      timestamp: new Date().toISOString(),
    });
    try {
      const cacheCheckStartedAt = performance.now();
      const storedVoices = await storedPiperVoices();
      console.log('[Sunny] Piper voice cache check complete:', {
        voice: config.name,
        cached: storedVoices.includes(config.name),
        durationMs: Math.round(performance.now() - cacheCheckStartedAt),
      });
      if (storedVoices.includes(config.name)) {
        console.log('[Sunny] Piper voice already cached:', config.name);
        onProgress(100);
        onDownloadStateChange('Speech model ready (cached)');
      } else {
        console.log('[Sunny] Downloading Piper voice:', config.name);
        onDownloaded();
        onDownloadStateChange('Downloading Speech model: 0%');
        onProgress(0);
        await downloadPiperVoice(config.name, (progress) => {
          const percent = progress.total ? (progress.loaded / progress.total) * 100 : 0;
          onProgress(percent);
        });
        onProgress(100);
        console.log('[Sunny] Piper voice download complete:', config.name);
      }
    } catch (error) {
      console.warn('[Sunny] Piper voice pre-cache unavailable; using runtime fallback:', error);
      console.log('[Sunny] Piper prepare complete with runtime fallback:', {
        voice: config.name,
        durationMs: Math.round(performance.now() - prepareStartedAt),
      });
    }
    const workerStartedAt = performance.now();
    await initializeWorker();
    console.log('[Sunny] Piper worker session ready:', {
      voice: config.name,
      durationMs: Math.round(performance.now() - workerStartedAt),
    });
  }

  export async function synthesize(text: string) {
    if (!worker) throw new Error('Piper TTS worker is not ready.');
    const synthesisStartedAt = performance.now();
    const speechText = normalizeForSpeech(text);
    console.log('[Sunny] Piper synthesis started using the prepared session:', {
      originalText: text,
      speechText,
      characterCount: speechText.length,
      timestamp: new Date().toISOString(),
    });
    const requestId = nextRequestId++;
    const audio = await new Promise<Blob>((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });
      worker?.postMessage({ type: 'synthesize', requestId, text: speechText });
    });
    console.log('[Sunny] Piper session.predict complete:', {
      durationMs: Math.round(performance.now() - synthesisStartedAt),
      totalDurationMs: Math.round(performance.now() - synthesisStartedAt),
      audioBytes: audio.size,
      audioType: audio.type,
    });
    return audio;
  }
</script>
