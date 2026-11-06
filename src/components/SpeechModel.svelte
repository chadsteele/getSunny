<script lang="ts">
  import {
    download as downloadPiperVoice,
    stored as storedPiperVoices,
    TtsSession,
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
  let session: TtsSession | undefined;

  export async function prepare() {
    session = await TtsSession.create({
      voiceId: config.name,
      allowLocalModels: true,
      fallbackStrategy: 'local',
      wasmPaths,
      logger: (message) => console.debug('[Sunny] Piper:', message),
    });
    console.log('[Sunny] Piper session ready:', {
      voice: config.name,
      localWasmPaths: wasmPaths,
    });

    try {
      const storedVoices = await storedPiperVoices();
      if (storedVoices.includes(config.name)) {
        console.log('[Sunny] Piper voice already cached:', config.name);
        onProgress(100);
        onDownloadStateChange('Speech model ready (cached)');
        return;
      }

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
    } catch (error) {
      console.warn('[Sunny] Piper voice pre-cache unavailable; using runtime fallback:', error);
    }
  }

  export async function synthesize(text: string) {
    if (!session) throw new Error('Piper TTS session is not ready.');
    const speechText = normalizeForSpeech(text);
    console.log('[Sunny] Piper synthesize called:', {
      originalText: text,
      speechText,
    });
    return session.predict(speechText);
  }
</script>
