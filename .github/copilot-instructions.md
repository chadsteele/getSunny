# Sunny Project Guidelines

## Architecture

- This is a SvelteKit application using strict TypeScript and Svelte 5.
- The voice experience is browser-local. Do not add a hosted LLM, transcription, or speech proxy, and do not introduce API keys for model inference.
- [VoiceAgent.svelte](../src/components/VoiceAgent.svelte) owns conversation orchestration: model preparation order, microphone lifecycle, transcription, conversation history, local generation, TTS playback, and chat rendering.
- Keep model-specific code in its dedicated component:
  - [LanguageModel.svelte](../src/components/LanguageModel.svelte) for local text generation.
  - [TranscriptionModel.svelte](../src/components/TranscriptionModel.svelte) for local speech-to-text.
  - [SpeechModel.svelte](../src/components/SpeechModel.svelte) for local Piper TTS.
- Use [model-config.ts](../src/lib/model-config.ts) for model configuration types and defaults. The `/api/config` endpoint exposes that configuration to the browser.
- The `/api/prompt` endpoint owns the system prompt and session scripts. Keep the `Session Opening Script` marker synchronized with the parser in `VoiceAgent.svelte`.
- Model preparation is intentionally sequential: language, speech, then transcription. Preserve this order and do not enable microphone capture before preparation and the introductory playback are complete.

## Local Runtime Requirements

- The microphone must be active only while Sunny is listening. Stop microphone tracks, close the input `AudioContext`, and cancel input animation work whenever Sunny is thinking, speaking, paused, ended, downloading, or in an error state.
- Keep conversation state in the browser. The ordered user and Sunny chat messages form the context for the next local language-model prompt; status messages are not prompt context.
- Preserve explicit error handling and chat-visible status reporting. Do not swallow model, microphone, playback, or network errors.
- Cross-origin isolation headers in [vite.config.ts](../vite.config.ts) and [netlify.toml](../netlify.toml) are required for browser WASM/WebGPU behavior. Keep them aligned when changing deployment or development configuration.
- Model assets are downloaded and cached locally. Do not commit generated model files, build output, `.svelte-kit`, `.netlify`, `dist`, or environment files.

## Svelte and TypeScript Conventions

- Follow the existing Svelte 5 patterns: runes such as `$state`, `$derived`, `$effect`, and component props via `$props()` where already used.
- Keep components typed with explicit interfaces and preserve strict TypeScript compatibility. Prefer guards and existing controller types over casts.
- Expose imperative model methods (`prepare`, `generate`, `transcribeAudio`, or `synthesize`) from the model component that owns the implementation; keep orchestration in `VoiceAgent.svelte`.
- Reuse existing styles and layout conventions in [styles.css](../src/styles.css). Preserve the chat bubble alignment, scroll behavior, sparkle overlay layering, and mobile-first layout.
- Avoid adding visible status text outside the chat thread unless the UX requirement explicitly changes. Errors and progress intended for users belong in chat; console logging is for diagnostics.

## Validation

- Install dependencies with `npm install` when needed.
- Run `npm run check` after TypeScript or Svelte changes.
- Run `npm run build` for production/deployment changes. Use a current Node.js version if the build reports missing Web Crypto APIs.
- For browser voice changes, manually verify model startup, microphone permission, intro playback, transcription, local generation, TTS playback, conversation scrolling, and microphone release between turns.

## Documentation and Security

- Treat source configuration and implementation as authoritative over stale model names or publish-directory text in older documentation.
- Never commit secrets, API keys, generated bundles, or downloaded model artifacts. Check generated output and repository history when investigating secret-scanning failures.
- Keep changes surgical and update directly related documentation when behavior or developer workflow changes.
