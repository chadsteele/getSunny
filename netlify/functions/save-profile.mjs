function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function saveProfile(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const projectId = process.env.STYTCH_PROJECT_ID;
  const stytchSecret = process.env.STYTCH_SECRET;
  const stytchApiUrl = process.env.STYTCH_API_URL ?? 'https://test.stytch.com';
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectId || !stytchSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    console.error('[save-profile] Required server environment variables are not configured.');
    return jsonResponse({ error: 'Profile storage is not configured.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  if (firstName.length < 1 || firstName.length > 100) {
    return jsonResponse({ error: 'First name must be between 1 and 100 characters.' }, 400);
  }

  const sessionToken = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!sessionToken) {
    return jsonResponse({ error: 'A Stytch session is required.' }, 401);
  }

  let stytchResponse;
  try {
    stytchResponse = await fetch(`${stytchApiUrl.replace(/\/+$/, '')}/v1/sessions/authenticate`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${projectId}:${stytchSecret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ session_token: sessionToken }),
    });
  } catch (error) {
    console.error('[save-profile] Stytch authentication request failed:', error);
    return jsonResponse({ error: 'Could not verify the Stytch session.' }, 502);
  }

  if (stytchResponse.status === 401) {
    return jsonResponse({ error: 'The Stytch session is invalid or expired.' }, 401);
  }
  if (!stytchResponse.ok) {
    console.error('[save-profile] Stytch session verification failed:', stytchResponse.status);
    return jsonResponse({ error: 'Could not verify the Stytch session.' }, 502);
  }

  let stytchResult;
  try {
    stytchResult = await stytchResponse.json();
  } catch (error) {
    console.error('[save-profile] Stytch returned an invalid response:', error);
    return jsonResponse({ error: 'Could not verify the Stytch session.' }, 502);
  }

  const userId =
    typeof stytchResult.user_id === 'string'
      ? stytchResult.user_id
      : typeof stytchResult.session?.user_id === 'string'
        ? stytchResult.session.user_id
        : '';
  if (!userId) {
    console.error('[save-profile] Stytch response did not include a user ID.');
    return jsonResponse({ error: 'Could not verify the Stytch session.' }, 502);
  }

  let supabaseResponse;
  try {
    supabaseResponse = await fetch(
      `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/sunny_profiles?on_conflict=user_id`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseServiceRoleKey,
          authorization: `Bearer ${supabaseServiceRoleKey}`,
          'content-type': 'application/json',
          prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify([{ user_id: userId, first_name: firstName }]),
      },
    );
  } catch (error) {
    console.error('[save-profile] Supabase request failed:', error);
    return jsonResponse({ error: 'Could not save your profile.' }, 502);
  }

  if (!supabaseResponse.ok) {
    let supabaseError;
    try {
      supabaseError = await supabaseResponse.json();
    } catch (error) {
      console.error('[save-profile] Supabase returned a non-JSON error response:', error);
    }

    const errorCode = typeof supabaseError?.code === 'string' ? supabaseError.code : '';
    console.error('[save-profile] Supabase profile upsert failed:', {
      status: supabaseResponse.status,
      code: errorCode || undefined,
    });

    if (errorCode === 'PGRST205' || errorCode === '42P01') {
      return jsonResponse(
        { error: 'The Supabase profile table is missing. Apply the sunny_profiles migration.' },
        503,
      );
    }
    if (supabaseResponse.status === 401 || supabaseResponse.status === 403) {
      return jsonResponse(
        { error: 'Supabase rejected the server credentials. Check SUPABASE_SERVICE_ROLE_KEY.' },
        502,
      );
    }
    return jsonResponse(
      {
        error: `Supabase profile write failed (HTTP ${supabaseResponse.status}${errorCode ? `, ${errorCode}` : ''}).`,
      },
      502,
    );
  }

  return jsonResponse({ user_id: userId }, 200);
}
