export function isHostnameInCookieDomain(hostname: string, cookieDomain: unknown): boolean {
  const domain = typeof cookieDomain === 'string' ? cookieDomain.trim().toLowerCase() : '';
  if (!domain) return false;
  const normalizedDomain = domain.startsWith('.') ? domain.slice(1) : domain;
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, '');
  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

export function hasSsoSession(
  cookieHeader: string = document.cookie,
  cookieName = import.meta.env.VITE_COOKIE_NAME,
  hostname: string = typeof window === 'undefined' ? '' : window.location.hostname,
  cookieDomain = import.meta.env.VITE_COOKIE_DOMAIN,
): boolean {
  const name = typeof cookieName === 'string' ? cookieName.trim() : '';
  if (!name) return false;
  if (hostname && !isHostnameInCookieDomain(hostname, cookieDomain)) return false;

  return cookieHeader
    .split(';')
    .some((cookie) => {
      const separator = cookie.indexOf('=');
      const cookieKey = (separator === -1 ? cookie : cookie.slice(0, separator)).trim();
      return cookieKey === name;
    });
}
