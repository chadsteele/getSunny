// This is a client-side SPA with no server-side rendering. The Netlify adapter
// generates a static bundle with index.html and the app JavaScript. All routes
// are handled client-side by the router. The _redirects file rewrites non-existent
// routes to index.html.
export const prerender = true;
export const ssr = false;
