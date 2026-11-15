import { createHash } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secret = /^[0-9a-f]{64}$/;
const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async function syncAnonymous(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: 'Anonymous storage is not configured.' }, 503);
  let body;
  try {
    const text = await request.text();
    if (text.length > 10_000_000) return json({ error: 'Synchronization data is too large.' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid synchronization request.' }, 400);
  }
  const token = request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if (
    !token ||
    !secret.test(token) ||
    typeof body?.initialUid !== 'string' ||
    !uuid.test(body.initialUid) ||
    !Array.isArray(body.sessions) ||
    !Array.isArray(body.reports) ||
    body.sessions.length > 200 ||
    body.reports.length > 10000 ||
    body.sessions.some(
      (session) =>
        !session ||
        typeof session.path !== 'string' ||
        session.path.length < 1 ||
        session.path.length > 512 ||
        !Array.isArray(session.messages) ||
        session.messages.some(
          (message) =>
            !message ||
            !Number.isSafeInteger(message.id) ||
            message.id < 0 ||
            !['user', 'assistant', 'status'].includes(message.role) ||
            typeof message.content !== 'string',
        ),
    )
  ) {
    return json({ error: 'Invalid synchronization data or credential.' }, 400);
  }
  const hash = createHash('sha256').update(token).digest('hex');
  let response;
  try {
    response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/sunny_sync_anonymous`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_initial_uid: body.initialUid,
        p_credential_hash: hash,
        p_sessions: body.sessions,
        p_reports: body.reports,
      }),
    });
  } catch (error) {
    console.error('[sync-anonymous] Database request failed:', error);
    return json({ error: 'Could not synchronize your conversation.' }, 502);
  }
  if (!response.ok) {
    console.error('[sync-anonymous] Database rejected synchronization:', response.status);
    return json({ error: 'Could not synchronize your conversation.' }, 502);
  }
  let accepted;
  try {
    accepted = await response.json();
  } catch {
    return json({ error: 'Invalid response from conversation storage.' }, 502);
  }
  if (accepted !== true) return json({ error: 'Invalid browser credential.' }, 403);
  return json({ ok: true }, 200);
}
