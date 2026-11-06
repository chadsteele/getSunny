<script lang="ts">
  import { transcribe } from '@localmode/core';
  import {
    isModelCached,
    preloadModel,
    transformers,
  } from '@localmode/transformers';
  import type { ModelConfig } from '../lib/model-config';

  interface Props {
    config: ModelConfig;
    onProgress: (progress: number) => void;
    onDownloadStateChange: (state: string) => void;
  }

  let { config, onProgress, onDownloadStateChange }: Props = $props();
  let model = $derived(transformers.speechToText(config.name));

  export async function prepare() {
    if (await isModelCached(config.name)) {
      console.log('[Sunny] Transcription model already cached:', config.name);
      onDownloadStateChange('Transcription model ready (cached)');
      onProgress(100);
      return;
    }

    console.log('[Sunny] Starting Transcription model download:', config.name);
    onDownloadStateChange('Downloading Transcription model: 0%');
    onProgress(0);
    await preloadModel(config.name, {
      onProgress: (progress) => onProgress(progress.progress ?? 0),
    });
    onProgress(100);
    console.log('[Sunny] Transcription model download complete:', config.name);
  }

  export async function transcribeAudio(audio: Blob) {
    return transcribe({ model, audio });
  }
</script>
