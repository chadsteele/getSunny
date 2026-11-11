export default async function transcribe(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'DEEPGRAM_API_KEY is not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const audio = Buffer.from(await request.arrayBuffer());
  if (!audio.length) {
    return new Response(JSON.stringify({ error: 'Audio data is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'content-type': request.headers.get('content-type') || 'audio/webm',
        },
        body: audio,
      },
    );
    if (!response.ok) {
      const details = await response.text();
      console.error('[transcribe] Deepgram returned an error:', response.status, details);
      return new Response(JSON.stringify({ error: 'Transcription failed' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    return new Response(JSON.stringify({ text: transcript }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('[transcribe] Deepgram request failed:', error);
    return new Response(JSON.stringify({ error: 'Transcription failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
