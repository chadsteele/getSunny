<script lang="ts">
  import { generateText } from '@localmode/core';
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
  import type { ModelConfig } from '../lib/model-config';

  interface Props {
    config: ModelConfig;
    onProgress: (progress: number) => void;
    onDownloadStateChange: (state: string) => void;
  }

  let { config, onProgress, onDownloadStateChange }: Props = $props();
  let model = $derived(
    config.location === 'webllm'
      ? webllm.languageModel(config.name)
      : config.location === 'huggingface'
        ? transformers.languageModel(config.name, {
            contextLength: 8192,
            device: 'webgpu',
            dtype: 'q4f16',
          })
        : undefined,
  );

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

  export async function generate(prompt: string, maxTokens: number) {
    if (!['webllm', 'huggingface'].includes(config.location) || !model) {
      throw new Error(`Unsupported language model location: ${config.location}`);
    }
    console.log('[Sunny] Starting local language generation:', {
      model: config.name,
      maxTokens,
    });
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 60_000);
    try {
      const response = await generateText({
        model,
        prompt,
        maxTokens,
        abortSignal: abortController.signal,
        maxRetries: 0,
        temperature: 0.7,
      });
      if (!response.text.trim()) throw new Error('Local language model returned an empty response.');
      console.log('[Sunny] Local language generation complete:', {
        characterCount: response.text.length,
        finishReason: response.finishReason,
      });
      return response.text;
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Local language model generation timed out after 60 seconds.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
</script>
