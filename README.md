# Sunny

A tiny Svelte experience inspired by the supplied mobile reference. The central sparkle responds to live frequency data from either the built-in ambient tone or an audio file selected by the user.

The app uses a browser-local voice conversation loop in [`VoiceAgent.svelte`](./src/components/VoiceAgent.svelte). Speech is transcribed immediately by the browser's built-in Web Speech API, responses stream from Venice `zai-org-glm-5-2`, and sentence audio is synthesized locally with Piper using the `en_US-libritts_r-medium` voice. Chrome and Edge provide the most consistent browser speech-recognition support. The existing [`Sparkle.svelte`](./src/components/Sparkle.svelte) and [`AudioControls.svelte`](./src/components/AudioControls.svelte) components remain the visual sparkle and pause/resume control.

Piper audio is generated in the browser and cached for the current session by
normalized text and voice. The Piper runtime and WASM assets are served locally;
the selected voice model is downloaded and cached by the Piper voice provider on
first use.

## Local development

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on port 5173 and the Netlify Functions server on port 9999. Vite proxies `/.netlify/functions/*` requests to the local functions.
The functions server runs in offline mode so local `.env` values are not
overridden by environment values from a linked Netlify site. Open
`http://localhost:5173`.

The voice loop requires microphone permission and the Venice API key for chat.
Piper runs locally in the browser and downloads the selected voice model on
first use.

```bash
VENICE_API_KEY=...
```

Run `npm run verify:venice` to make a minimal Venice chat completion request.

Configure `VENICE_API_KEY` in Netlify under **Site configuration → Environment variables**. Never expose it in `PUBLIC_` variables or client-side code.

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
