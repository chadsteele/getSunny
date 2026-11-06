import { json } from '@sveltejs/kit';
import prompts from './prompts';


export function GET({ url }: { url: URL }) {
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return json({ prompts }, {
    headers: {
      'Cache-Control': isLocalhost
        ? 'no-store, no-cache, must-revalidate'
        : 'public, max-age=300',
    },
  });
}
