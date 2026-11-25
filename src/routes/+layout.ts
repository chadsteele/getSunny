// This is a client-side SPA with no server-side rendering. Prerender = true
// generates a static index.html that serves the app. The entries() function limits
// prerendering to just the root route; SvelteKit's client-side router handles
// all other routes. This avoids prerendering individual route HTML files.
export const prerender = true;
export const ssr = false;

export function entries() {
  return [{ path: '/' }];
}
