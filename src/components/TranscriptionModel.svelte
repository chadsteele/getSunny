<script lang="ts">
  import {
    AutoProcessor,
    GraniteSpeechForConditionalGeneration,
    Tensor,
  } from '@huggingface/transformers';
  import type { ProgressInfo } from '@huggingface/transformers';
  import { transcribe } from '@localmode/core';
  import { isModelCached, preloadModel, transformers } from '@localmode/transformers';
  import { logger as console } from '../lib/logger';
  import type { ModelConfig } from '../lib/model-config';

  interface Props {
    config: ModelConfig;
    onProgress: (progress: number) => void;
    onDownloadStateChange: (state: string) => void;
  }

  let { config, onProgress, onDownloadStateChange }: Props = $props();
  let isGraniteSpeech = $derived(config.name === 'onnx-community/granite-4.0-1b-speech-ONNX');
  let model = $derived(transformers.speechToText(config.name));
  let graniteProcessorPromise: ReturnType<typeof AutoProcessor.from_pretrained> | undefined;
  let graniteModelPromise:
    ReturnType<typeof GraniteSpeechForConditionalGeneration.from_pretrained> | undefined;

  type WebGpuAdapter = {
    limits: {
      maxBufferSize: number;
      maxStorageBufferBindingSize: number;
    };
  };
  type WebGpu = {
    requestAdapter: (options?: {
      powerPreference?: 'low-power' | 'high-performance';
    }) => Promise<WebGpuAdapter | null>;
  };

  function reportGraniteProgress(label: string, progress: ProgressInfo) {
    if (!('progress' in progress)) return;
    const percentage = Math.round(progress.progress);
    if (progress.status === 'progress_total') {
      onProgress(percentage);
      onDownloadStateChange(`${label}: ${percentage}%`);
    }
    console.log(`[Sunny] Granite Speech ${label.toLowerCase()}:`, {
      file: 'file' in progress ? progress.file : 'all files',
      progress: percentage,
    });
  }

  async function requireGraniteWebGpu() {
    if (!isGraniteSpeech) return;
    const gpu =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { gpu?: WebGpu }).gpu
        : undefined;
    if (!gpu) {
      throw new Error(
        'Granite Speech requires WebGPU, but this browser does not expose WebGPU. Use a supported browser with hardware acceleration enabled.',
      );
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error(
        'Granite Speech requires a usable WebGPU adapter, but no GPU adapter is available. Update your graphics drivers, enable hardware acceleration, or use a device with a supported GPU.',
      );
    }

    console.log('[Sunny] Granite Speech WebGPU adapter available:', {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    });
  }

  function readWavAudio(audio: Blob) {
    return audio.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
        throw new Error('Granite Speech requires WAV audio input.');
      }

      const sampleRate = view.getUint32(24, true);
      const channels = view.getUint16(22, true);
      const bitsPerSample = view.getUint16(34, true);
      const dataOffset = 44;
      if (sampleRate !== 16_000 || channels !== 1 || bitsPerSample !== 16) {
        throw new Error('Granite Speech requires 16 kHz, mono, 16-bit WAV audio.');
      }

      const sampleCount = Math.floor((buffer.byteLength - dataOffset) / 2);
      const samples = new Float32Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        samples[index] = view.getInt16(dataOffset + index * 2, true) / 0x8000;
      }
      return samples;
    });
  }

  async function getGraniteProcessor() {
    if (!graniteProcessorPromise) {
      console.log('[Sunny] Loading Granite Speech processor:', config.name);
      graniteProcessorPromise = AutoProcessor.from_pretrained(config.name, {
        progress_callback: (progress: ProgressInfo) =>
          reportGraniteProgress('processor download', progress),
      });
    }
    return graniteProcessorPromise;
  }

  async function getGraniteModel() {
    if (!graniteModelPromise) {
      await requireGraniteWebGpu();
      console.log('[Sunny] Loading Granite Speech WebGPU model:', config.name);
      graniteModelPromise = GraniteSpeechForConditionalGeneration.from_pretrained(config.name, {
        dtype: {
          embed_tokens: 'q4',
          audio_encoder: 'q4',
          decoder_model_merged: 'q4',
        },
        device: 'webgpu',
        progress_callback: (progress) => reportGraniteProgress('model download', progress),
      });
    }
    return graniteModelPromise;
  }

  async function transcribeWithGranite(audio: Blob, maxNewTokens = 256) {
    const processor = await getGraniteProcessor();
    console.log('[Sunny] Granite Speech processor ready:', config.name);
    const graniteModel = await getGraniteModel();
    console.log('[Sunny] Granite Speech model ready:', config.name);
    onProgress(100);
    onDownloadStateChange('Transcription model ready');
    const samples = await readWavAudio(audio);
    const messages = [
      {
        role: 'user',
        content: '<|audio|>can you transcribe the speech into a written format?',
      },
    ];
    const text = processor.apply_chat_template(messages, {
      add_generation_prompt: false,
      tokenize: false,
    });
    const inputs = await processor(text, samples);
    console.log('[Sunny] Running Granite Speech transcription:', {
      audioSamples: samples.length,
      maxNewTokens,
    });
    const generatedIds = (await withTimeout(
      graniteModel.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
      }),
      120_000,
      `Granite Speech inference timed out after 120 seconds for ${config.name}.`,
    )) as Tensor;
    const promptLength = inputs.input_ids.dims.at(-1);
    const generatedTexts = processor.batch_decode(generatedIds.slice(null, [promptLength, null]), {
      skip_special_tokens: true,
    });
    return { text: generatedTexts[0]?.trim() ?? '' };
  }

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  }

  async function boostQuietAudio(audio: Blob) {
    const buffer = await audio.arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
      return audio;
    }

    const dataOffset = 44;
    const sampleCount = Math.floor((buffer.byteLength - dataOffset) / 2);
    let peak = 0;
    let totalEnergy = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = view.getInt16(dataOffset + index * 2, true) / 0x8000;
      peak = Math.max(peak, Math.abs(sample));
      totalEnergy += sample ** 2;
    }
    const rms = Math.sqrt(totalEnergy / Math.max(1, sampleCount));
    console.log('[Sunny] Transcription PCM level:', {
      peak: Number(peak.toFixed(4)),
      rms: Number(rms.toFixed(4)),
      sampleCount,
    });
    if (peak >= 0.1 || peak === 0) return audio;

    const gain = Math.min(6, 0.6 / peak);
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = view.getInt16(dataOffset + index * 2, true) / 0x8000;
      const amplified = Math.max(-1, Math.min(1, sample * gain));
      view.setInt16(dataOffset + index * 2, amplified * (amplified < 0 ? 0x8000 : 0x7fff), true);
    }
    console.log('[Sunny] Retrying transcription with quiet-audio gain:', {
      gain: Number(gain.toFixed(2)),
    });
    return new Blob([buffer], { type: 'audio/wav' });
  }

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
        const gate =
          distanceFromFloor < gateThreshold
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

  function createWarmupAudio() {
    const sampleRate = 16_000;
    const sampleCount = sampleRate;
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, sampleCount * 2, true);
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function warmModel() {
    const warmupStartedAt = performance.now();
    console.log('[Sunny] Warming transcription model:', config.name);
    if (isGraniteSpeech) await transcribeWithGranite(createWarmupAudio(), 32);
    else await transcribe({ model, audio: createWarmupAudio() });
    console.log('[Sunny] Transcription model warmup complete:', {
      model: config.name,
      durationMs: Math.round(performance.now() - warmupStartedAt),
    });
  }

  export async function prepare() {
    await requireGraniteWebGpu();
    if (await isModelCached(config.name)) {
      console.log('[Sunny] Transcription model already cached:', config.name);
      onDownloadStateChange(
        isGraniteSpeech ? 'Preparing Granite Speech model' : 'Transcription model ready (cached)',
      );
      if (!isGraniteSpeech) onProgress(100);
      await warmModel();
      return;
    }

    console.log('[Sunny] Starting Transcription model download:', config.name);
    onDownloadStateChange('Downloading Transcription model: 0%');
    onProgress(0);
    await preloadModel(config.name, {
      onProgress: (progress) => {
        const percentage = Math.round(progress.progress ?? 0);
        onProgress(isGraniteSpeech ? Math.min(99, percentage) : percentage);
      },
    });
    if (!isGraniteSpeech) onProgress(100);
    console.log('[Sunny] Transcription model download complete:', config.name);
    await warmModel();
  }

  export async function transcribeAudio(audio: Blob) {
    const preprocessedAudio = await preprocessAudio(audio);
    if (isGraniteSpeech) return transcribeWithGranite(preprocessedAudio);
    const result = await transcribe({ model, audio: preprocessedAudio });
    if (result.text.trim() || preprocessedAudio === audio) return result;

    console.warn('[Sunny] Preprocessed transcription was empty; retrying original audio');
    const originalResult = await transcribe({ model, audio });
    if (originalResult.text.trim()) return originalResult;

    const boostedAudio = await boostQuietAudio(audio);
    if (boostedAudio === audio) return originalResult;
    return transcribe({ model, audio: boostedAudio });
  }
</script>
