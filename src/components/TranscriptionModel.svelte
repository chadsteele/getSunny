<script lang="ts">
  import { transcribe } from '@localmode/core';
  import {
    isModelCached,
    preloadModel,
    transformers,
  } from '@localmode/transformers';
  import { logger as console } from '../lib/logger';
  import type { ModelConfig } from '../lib/model-config';

  interface Props {
    config: ModelConfig;
    onProgress: (progress: number) => void;
    onDownloadStateChange: (state: string) => void;
  }

  let { config, onProgress, onDownloadStateChange }: Props = $props();
  let model = $derived(transformers.speechToText(config.name));

  function preprocessAudio(audio: Blob) {
    return audio.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
        return audio;
      }

      const sampleRate = view.getUint32(24, true);
      const dataOffset = 44;
      const sampleCount = Math.floor((buffer.byteLength - dataOffset) / 2);
      if (!sampleRate || sampleCount <= 0) return audio;

      const samples = new Float32Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        samples[index] = view.getInt16(dataOffset + index * 2, true) / 0x8000;
      }

      const noiseSampleCount = Math.min(sampleCount, Math.floor(sampleRate * 0.05));
      let noiseEnergy = 0;
      for (let index = 0; index < noiseSampleCount; index += 1) {
        noiseEnergy += samples[index] ** 2;
      }
      const noiseFloor = Math.sqrt(noiseEnergy / Math.max(1, noiseSampleCount));
      const gateThreshold = Math.max(0.002, noiseFloor * 1.2);
      let previousInput = 0;
      let previousOutput = 0;

      for (let index = 0; index < samples.length; index += 1) {
        const input = samples[index];
        const highPassed = input - previousInput + previousOutput * 0.995;
        previousInput = input;
        const distanceFromFloor = Math.abs(highPassed);
        const gate = distanceFromFloor < gateThreshold
          ? distanceFromFloor / Math.max(gateThreshold, 0.0001)
          : 1;
        const output = highPassed * gate;
        previousOutput = output;
        view.setInt16(
          dataOffset + index * 2,
          Math.max(-1, Math.min(1, output)) * (output < 0 ? 0x8000 : 0x7fff),
          true,
        );
      }

      return new Blob([buffer], { type: 'audio/wav' });
    });
  }

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
    const preprocessedAudio = await preprocessAudio(audio);
    const result = await transcribe({ model, audio: preprocessedAudio });
    if (result.text.trim() || preprocessedAudio === audio) return result;

    console.warn('[Sunny] Preprocessed transcription was empty; retrying original audio');
    return transcribe({ model, audio });
  }
</script>
