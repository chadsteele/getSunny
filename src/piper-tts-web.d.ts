declare module 'piper-tts-web' {
  export class PhonemizeWebRuntime {
    constructor(options?: { provider: { fetch(url: string): Promise<string>; destroy(): void } });
    loadModule(): Promise<unknown>;
  }

  export class PiperWebEngine {
    constructor(options?: Record<string, unknown>);
    generate(text: string, voice: string, speaker?: number): Promise<{ file: Blob }>;
    destroy(): void;
  }
}
