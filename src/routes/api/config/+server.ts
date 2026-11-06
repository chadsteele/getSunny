import { json } from '@sveltejs/kit';
import { defaultAppConfig } from '../../../lib/model-config';

export function GET({ url }: { url: URL }) {
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return json(defaultAppConfig, {
    headers: {
      'Cache-Control': isLocalhost
        ? 'no-store, no-cache, must-revalidate'
        : 'public, max-age=300',
    },
  });
}
