interface PublicEnv {
  appName: string;
  rootDomain: string;
  cookieDomain: string;
  appUrl: string;
  siblingAppUrl: string;
  authLoginUrl: string;
  authLogoutUrl: string;
  cookieName: string;
}

function required(name: string): string {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function validateUrl(name: string, value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new Error();
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL (or localhost during development).`);
  }
}

function validateDomain(name: string, value: string, leadingDot: boolean): string {
  const domain = leadingDot ? value.slice(1) : value;
  if (!domain || value !== (leadingDot ? `.${domain}` : domain) || !/^[a-z0-9.-]+$/i.test(domain)) {
    throw new Error(
      `${name} must be a valid domain${leadingDot ? ' with a leading dot' : ''}.`,
    );
  }
  return value;
}

const publicEnv: PublicEnv = {
  appName: required('VITE_APP_NAME'),
  rootDomain: validateDomain('VITE_ROOT_DOMAIN', required('VITE_ROOT_DOMAIN'), false),
  cookieDomain: validateDomain('VITE_COOKIE_DOMAIN', required('VITE_COOKIE_DOMAIN'), true),
  appUrl: validateUrl('VITE_APP_URL', required('VITE_APP_URL')),
  siblingAppUrl: validateUrl('VITE_SIBLING_APP_URL', required('VITE_SIBLING_APP_URL')),
  authLoginUrl: validateUrl('VITE_AUTH_LOGIN_URL', required('VITE_AUTH_LOGIN_URL')),
  authLogoutUrl: validateUrl('VITE_AUTH_LOGOUT_URL', required('VITE_AUTH_LOGOUT_URL')),
  cookieName: required('VITE_COOKIE_NAME'),
};

export default publicEnv;
