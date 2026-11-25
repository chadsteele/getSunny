// Prerender only the root route at build time. SSR is disabled, so routes must be
// explicitly prerendered or marked with prerender = false to be served dynamically.
// The /sessions route loads dynamic browser storage data, so it's excluded here and
// marked with prerender = false in its own +page.ts to be served on-demand.
export const prerender = true;
export const ssr = false;

export async function entries() {
  return [
    { path: '/' },
  ];
}
