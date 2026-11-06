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

  export async function prepare() {
    if (!['webllm', 'huggingface'].includes(config.location) || !model) {
      throw new Error(`Unsupported language model location: ${config.location}`);
    }
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
    if (config.location === 'webllm') await preloadWebLLMModel(config.name, options);
    else await preloadTransformersModel(config.name, options);
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
    maxTokens: number,
    onChunk: (chunk: string) => void,
  ) {
    if (!['webllm', 'huggingface'].includes(config.location) || !model) {
      throw new Error(`Unsupported language model location: ${config.location}`);
    }
    console.log('[Sunny] Starting streaming local language generation:', {
      model: config.name,
      maxTokens,
    });
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 30_000);
    try {
      const result = await streamText({
        model,
        prompt,
        maxTokens,
        abortSignal: abortController.signal,
        maxRetries: 0,
        stopSequences: ['\nUser:', '\nSystem:', '\nConversation:'],
        temperature: 0.35,
      });
      let pending = '';
      let fullText = '';
      for await (const chunk of result.stream) {
        pending += chunk.text;
        fullText += chunk.text;
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
      }
      if (pending.trim()) onChunk(pending.trim());
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
