# Sunny

A tiny Svelte experience inspired by the supplied mobile reference. The central sparkle responds to live frequency data from either the built-in ambient tone or an audio file selected by the user.

The app uses a server-backed streaming voice conversation loop in [`VoiceAgent.svelte`](./src/components/VoiceAgent.svelte). Audio is transcribed by Deepgram, responses stream from Gemini 2.5 Flash Lite, and sentence audio is synthesized by OpenAI TTS-1. The existing [`Sparkle.svelte`](./src/components/Sparkle.svelte) and [`AudioControls.svelte`](./src/components/AudioControls.svelte) components remain the visual sparkle and pause/resume control.

## Local development

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on port 5173 and the Netlify Functions server on port
9999. Vite proxies `/.netlify/functions/*` requests to the local functions.
Open `http://localhost:5173`.

The voice loop requires microphone permission and server-side API keys. No AI models are downloaded to the browser.

```bash
DEEPGRAM_API_KEY=...
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

Configure these variables in Netlify under **Site configuration → Environment variables**. Never expose them in `PUBLIC_` variables or client-side code.

The app is mobile-first and becomes a framed phone layout on larger screens.

## Build

```bash
npm run check
npm run build
```

## Publish to GitHub

Create an empty repository on GitHub, then run:

```bash
git init
git add .
git commit -m "Create Sunny audio-reactive experience"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```

## Publish to Netlify

Import the GitHub repository into Netlify. The included [`netlify.toml`](./netlify.toml) configures:

- Build command: `npm run build`
- Publish directory: `dist`

No environment variables are required.
## Development requirements

Use Node.js 22 or newer. The repository includes an [.nvmrc](./.nvmrc) file for
`nvm` users:

```bash
nvm install
nvm use
npm install
```
