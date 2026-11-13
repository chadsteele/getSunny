# Sunny Project Guidelines

## Architecture

- This is a SvelteKit application using strict TypeScript and Svelte 5.
- The voice experience uses the browser Web Speech API for transcription, local Piper TTS for speech, and a standalone Netlify Function for streamed Venice responses.
- [VoiceAgent.svelte](../src/components/VoiceAgent.svelte) owns microphone lifecycle, remote requests, sentence buffering, ordered TTS playback, and chat rendering.
- Keep `VENICE_API_KEY` server-side in Netlify environment variables. Browser STT and local Piper TTS do not require provider API keys.
- The `/api/prompt` endpoint owns the system prompt and session scripts. Keep the `Session Opening Script` marker synchronized with the parser in `VoiceAgent.svelte`.
- Piper runs in the browser; its selected voice model is downloaded and cached in IndexedDB. Do not add additional browser inference systems or model assets.

## Local Runtime Requirements

- The microphone must be active only while Sunny is listening. Stop microphone tracks whenever Sunny is thinking, speaking, paused, ended, or in an error state.
- Keep conversation state in the browser. The ordered user and Sunny chat messages form the context for the next remote language-model prompt; status messages are not prompt context.
- Preserve explicit error handling and chat-visible status reporting. Do not swallow model, microphone, playback, or network errors.
- Do not add browser WASM/WebGPU model assets. Do not commit generated model files, build output, `.svelte-kit`, `.netlify`, `dist`, or environment files.

## Svelte and TypeScript Conventions

- Follow the existing Svelte 5 patterns: runes such as `$state`, `$derived`, `$effect`, and component props via `$props()` where already used.
- Keep components typed with explicit interfaces and preserve strict TypeScript compatibility. Prefer guards and existing controller types over casts.
- Keep server integrations in the standalone Netlify Functions; keep orchestration in `VoiceAgent.svelte`.
- Reuse existing styles and layout conventions in [styles.css](../src/styles.css). Preserve the chat bubble alignment, scroll behavior, sparkle overlay layering, and mobile-first layout.
- Avoid adding visible status text outside the chat thread unless the UX requirement explicitly changes. Errors and progress intended for users belong in chat; console logging is for diagnostics.

## Validation

- Install dependencies with `npm install` when needed.
- Run `npm run check` after TypeScript or Svelte changes.
- Run `npm run build` for production/deployment changes. Use a current Node.js version if the build reports missing Web Crypto APIs.
- For browser voice changes, manually verify microphone permission, intro playback, transcription, streamed generation, TTS playback, conversation scrolling, and microphone release between turns.

## Documentation and Security

- Treat source configuration and implementation as authoritative over stale model names or publish-directory text in older documentation.
- Never commit secrets, API keys, generated bundles, or downloaded model artifacts. Check generated output and repository history when investigating secret-scanning failures.
- Keep changes surgical and update directly related documentation when behavior or developer workflow changes.
