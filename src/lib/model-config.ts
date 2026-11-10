export interface ModelConfig {
  name: string;
  location: string;
}

export interface AppConfig {
  models: {
    transcription: ModelConfig;
    language: ModelConfig;
    speech: ModelConfig;
  };
  assets: {
    onnxWasm: string;
    piperData: string;
    piperWasm: string;
  };
}

export interface TranscriptionModelController {
  prepare: () => Promise<void>;
  transcribeAudio: (audio: Blob) => Promise<{ text: string }>;
}

export interface LanguageModelController {
  prepare: () => Promise<void>;
  warm: () => Promise<void>;
  generate: (prompt: string, maxTokens?: number) => Promise<string>;
  generateStreaming: (
    prompt: string,
    maxTokens: number | undefined,
    onChunk: (chunk: string) => void,
  ) => Promise<string>;
}

export interface SpeechModelController {
  prepare: () => Promise<void>;
  synthesize: (text: string) => Promise<Blob>;
}

export const defaultAppConfig: AppConfig = {
  models: {
    transcription: {
      name: 'onnx-community/granite-4.0-1b-speech-ONNX',
      location: 'huggingface',
    },
    language: {
      name: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
      location: 'webllm',
    },
    speech: {
      name: 'en_US-libritts_r-medium',
      location: 'piper',
    },
  },
  assets: {
    onnxWasm: '/piper/onnx/',
    piperData: '/piper/phonemize/piper_phonemize.data',
    piperWasm: '/piper/phonemize/piper_phonemize.wasm',
  },
};
