# Sunny

A mobile-first voice conversation experience. The central sparkle responds to microphone input and Sunny's speech.

The app uses a browser-local voice conversation loop in [`VoiceAgent.svelte`](./src/components/VoiceAgent.svelte). Speech is transcribed by the browser's built-in Web Speech API, responses stream from Venice `zai-org-glm-5-2`, and sentence audio is synthesized locally with Piper using the `en_US-libritts_r-medium` voice. Chrome and Edge provide the most consistent browser speech-recognition support. [`Sparkle.svelte`](./src/components/Sparkle.svelte) renders the audio-reactive visual, while [`Footer.svelte`](./src/components/Footer.svelte) provides microphone and speaker controls.

The first entry in [`prompts.ts`](./src/lib/prompts.ts) is the spoken opening; the second is the conversation system prompt sent with Venice requests.

Use **Show logger** in the menu to view the most recent 200 application log entries on the device; **Show chat** returns to the conversation. Logs are kept in memory only and may include conversation text and error details.

Piper audio is generated directly in the browser for each sentence. The Piper runtime and WASM assets are served locally.
The voice model is downloaded on first use and cached in the browser's IndexedDB for later visits. On subsequent
visits, Sunny checks for voice updates in the background; a downloaded update is used on the next visit. The browser
may evict the cache, or private browsing may prevent it from persisting. The footer progress bar shows voice downloads
when the server provides their size, or an indeterminate indicator otherwise.
Piper runtime assets bypass the browser HTTP cache to avoid invalid cached responses. If an asset load fails, Sunny
retries with a fresh URL and reports an error if that also fails.

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
- Publish directory: `.svelte-kit/netlify`

Configure `VENICE_API_KEY` in Netlify for chat responses.

## Development requirements

Use Node.js 22 or newer. The repository includes an [.nvmrc](./.nvmrc) file for
`nvm` users:

```bash
nvm install
nvm use
npm install
```
