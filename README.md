# Sunny

A tiny Svelte experience inspired by the supplied mobile reference. The central sparkle responds to live frequency data from either the built-in ambient tone or an audio file selected by the user.

## Local development

```bash
npm install
npm run dev
```

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
