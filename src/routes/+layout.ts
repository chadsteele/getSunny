// This app is fully client-side rendered (ssr = false), so it's served as a SPA
// with a single HTML entry point. Set prerender = false to let Netlify serve all
// routes dynamically from index.html, avoiding route-not-found errors.
export const prerender = false;
export const ssr = false;
