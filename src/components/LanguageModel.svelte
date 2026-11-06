<script lang="ts">
  import { generateText, streamText } from '@localmode/core';
  import {
    isModelCached as isTransformersModelCached,
    preloadModel as preloadTransformersModel,
    transformers,
  } from '@localmode/transformers';
  import {
    isModelCached as isWebLLMModelCached,
    preloadModel as preloadWebLLMModel,
    webllm,
  } from '@localmode/webllm';
  import { logger as console } from '../lib/logger';
  import type { ModelConfig } from '../lib/model-config';

  interface Props {
    config: ModelConfig;
    onProgress: (progress: number) => void;
    onDownloadStateChange: (state: string) => void;
  }

  let { config, onProgress, onDownloadStateChange }: Props = $props();
  let warmupPromise: Promise<void> | undefined;
  type WebGpuAdapter = {
    limits: {
      maxBufferSize: number;
      maxStorageBufferBindingSize: number;
    };
  };
  type WebGpu = {
    requestAdapter: (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<WebGpuAdapter | null>;
  };
  let model = $derived(
    config.location === 'webllm'
      ? webllm.languageModel(config.name)
      : config.location === 'huggingface'
        ? transformers.languageModel(config.name, {
            contextLength: 4096,
            device: 'webgpu',
            dtype: 'q4f16',
          })
        : undefined,
  );

  async function warmModel() {
    if (warmupPromise || !model) return warmupPromise;
    warmupPromise = (async () => {
      console.log('[Sunny] Warming local language model:', config.name);
      await generateText({
        model,
        prompt: 'Respond with exactly one word: ready.',
        maxTokens: 2,
        maxRetries: 0,
        temperature: 0.1,
        stopSequences: ['\n'],
      });
      console.log('[Sunny] Local language model warmup complete:', config.name);
    })();
    return warmupPromise;
  }

  async function requireWebGpu() {
    const gpu = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { gpu?: WebGpu }).gpu
      : undefined;
    if (!gpu) {
      throw new Error(
        'This device or browser does not support WebGPU required for the 7B language model. Please use a more powerful device with WebGPU support.',
      );
    }
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error(
        'No suitable WebGPU adapter is available for the 7B language model. Please switch to a more powerful device with a supported GPU.',
      );
    }
    console.log('[Sunny] WebGPU adapter available for language model:', {
      model: config.name,
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    });
  }

  export async function prepare() {
    if (!['webllm', 'huggingface'].includes(config.location) || !model) {
      throw new Error(`Unsupported language model location: ${config.location}`);
    }
    if (config.location === 'webllm') await requireWebGpu();
    const isCached =
      config.location === 'webllm'
        ? await isWebLLMModelCached(config.name)
        : await isTransformersModelCached(config.name);
    if (isCached) {
      console.log('[Sunny] Language model already cached:', config.name);
      onDownloadStateChange('LLM model ready (cached)');
      onProgress(100);
      return;
    }

    console.log('[Sunny] Starting LLM model download:', config.name);
    onDownloadStateChange('Downloading LLM model: 0%');
    onProgress(0);
    const options = { onProgress: (progress: { progress?: number }) => onProgress(progress.progress ?? 0) };
    try {
      if (config.location === 'webllm') await preloadWebLLMModel(config.name, options);
      else await preloadTransformersModel(config.name, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/webgpu|gpu|memory|buffer|device|adapter/i.test(message)) {
        throw new Error(
          `This device could not load the 7B language model. Please switch to a more powerful device with a supported GPU. ${message}`,
        );
      }
      throw error;
    }
    onProgress(100);
    console.log('[Sunny] WebLLM model download complete:', config.name);
  }

  export async function warm() {
    await warmModel();
  }

  export async function generate(prompt: string, maxTokens?: number) {
    if (!['webllm', 'huggingface'].includes(config.location) || !model) {
      throw new Error(`Unsupported language model location: ${config.location}`);
    }
    console.log('[Sunny] Starting local language generation:', {
      model: config.name,
      maxTokens: maxTokens ?? 'default',
    });
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 30_000);
    try {
      const generationOptions = {
        model,
        prompt,
        abortSignal: abortController.signal,
        maxRetries: 0,
        stopSequences: ['\nUser:', '\nSystem:', '\nConversation:'],
        temperature: 0.35,
        ...(maxTokens === undefined ? {} : { maxTokens }),
      };
      const response = await generateText(generationOptions);
      if (!response.text.trim()) throw new Error('Local language model returned an empty response.');
      console.log('[Sunny] Local language generation complete:', {
        characterCount: response.text.length,
        finishReason: response.finishReason,
      });
      return response.text;
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Local language model generation timed out after 30 seconds.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  export async function generateStreaming(
    prompt: string,
    maxTokens: number | undefined,
    onChunk: (chunk: string) => void,
  ) {
    if (!['webllm', 'huggingface'].includes(config.location) || !model) {
      throw new Error(`Unsupported language model location: ${config.location}`);
    }
    console.log('[Sunny] Starting streaming local language generation:', {
      model: config.name,
      maxTokens: maxTokens ?? 'default',
    });
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 30_000);
    try {
      const result = await streamText({
        model,
        prompt,
        abortSignal: abortController.signal,
        maxRetries: 0,
        stopSequences: ['\nUser:', '\nSystem:', '\nConversation:'],
        temperature: 0.35,
        ...(maxTokens === undefined ? {} : { maxTokens }),
      });
      let pending = '';
      let fullText = '';
      let rawText = '';
      let insideThinking = false;

      const emitVisibleText = (text: string) => {
        pending += text;
        fullText += text;
        const sentenceBoundary = /[.!?](?=\s|$)/g;
        let boundary: RegExpExecArray | null;
        let lastBoundary = 0;
        while ((boundary = sentenceBoundary.exec(pending))) {
          const end = boundary.index + boundary[0].length;
          const sentence = pending.slice(lastBoundary, end).trim();
          if (sentence) onChunk(sentence);
          lastBoundary = end;
        }
        if (lastBoundary > 0) pending = pending.slice(lastBoundary);
      };

      for await (const chunk of result.stream) {
        rawText += chunk.text;
        let remaining = chunk.text;
        while (remaining) {
          if (insideThinking) {
            const end = remaining.toLowerCase().indexOf('</think>');
            if (end < 0) break;
            remaining = remaining.slice(end + '</think>'.length);
            insideThinking = false;
            continue;
          }
          const start = remaining.toLowerCase().indexOf('<think>');
          if (start < 0) {
            emitVisibleText(remaining);
            break;
          }
          emitVisibleText(remaining.slice(0, start));
          remaining = remaining.slice(start + '<think>'.length);
          insideThinking = true;
        }
      }
      if (!insideThinking && pending.trim()) onChunk(pending.trim());
      if (!fullText.trim() && rawText.trim()) {
        const recoveredText = rawText
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<think>[\s\S]*$/gi, '')
          .trim();
        console.warn('[Sunny] Streaming filter recovered final text:', {
          rawCharacterCount: rawText.length,
          recoveredCharacterCount: recoveredText.length,
        });
        if (recoveredText) {
          fullText = recoveredText;
          onChunk(recoveredText);
        }
      }
      console.log('[Sunny] Streaming text filter result:', {
        rawCharacterCount: rawText.length,
        visibleCharacterCount: fullText.length,
        endedInsideThinking: insideThinking,
      });
      if (!fullText.trim()) throw new Error('Local language model returned an empty response.');
      console.log('[Sunny] Streaming local language generation complete:', {
        characterCount: fullText.length,
      });
      return fullText;
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Local language model streaming timed out after 30 seconds.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
</script>
