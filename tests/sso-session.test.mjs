import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let ssoSession;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ssoSession = await server.ssrLoadModule('/src/lib/sso-session.ts');
});

after(async () => {
  await server?.close();
});

test('detects an exact SSO cookie name', () => {
  assert.equal(ssoSession.hasSsoSession('theme=dark; sso_session=token; other=yes', 'sso_session'), true);
  assert.equal(ssoSession.hasSsoSession('sso_session_extra=token', 'sso_session'), false);
  assert.equal(ssoSession.hasSsoSession('theme=dark', 'sso_session'), false);
});

test('requires the browser host to belong to the configured cookie domain', () => {
  assert.equal(ssoSession.isHostnameInCookieDomain('sunny.mastermoney.ai', '.mastermoney.ai'), true);
  assert.equal(ssoSession.isHostnameInCookieDomain('localhost', '.mastermoney.ai'), false);
  assert.equal(
    ssoSession.hasSsoSession('sso_session=token', 'sso_session', 'sunny.mastermoney.ai', '.mastermoney.ai'),
    true,
  );
  assert.equal(
    ssoSession.hasSsoSession('sso_session=token', 'sso_session', 'localhost', '.mastermoney.ai'),
    false,
  );
});
