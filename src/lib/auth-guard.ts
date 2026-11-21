import { StytchClient } from '@stytch/vanilla-js/headless';
import env from '../env';

function isAllowedReturnTo(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === env.rootDomain || url.hostname.endsWith(`.${env.rootDomain}`))
    );
  } catch {
    return false;
  }
}

export function redirectToLoginIfNeeded(): void {
  if (env.authLoginUrl === env.appUrl || location.pathname === '/user') return;

  const publicToken = import.meta.env.VITE_STYTCH_PUBLIC_TOKEN;
  if (!publicToken) {
    throw new Error('Missing required environment variable: VITE_STYTCH_PUBLIC_TOKEN');
  }

  const stytch = new StytchClient(publicToken);
  if (stytch.session.getSync()) return;

  const returnTo = isAllowedReturnTo(location.href) ? location.href : env.appUrl;
  const loginUrl = new URL('/login', `${env.authLoginUrl}/`);
  loginUrl.searchParams.set('returnTo', returnTo);
  location.assign(loginUrl);
}
