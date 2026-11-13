export default async function transcribe(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'DEEPGRAM_API_KEY is not configured' }, { status: 500 });
  }
  try {
    const audio = await request.arrayBuffer();
    if (!audio.byteLength)
      return Response.json({ error: 'Audio data is required' }, { status: 400 });
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
      console.error(
        '[transcribe] Deepgram request failed:',
        response.status,
        await response.text(),
      );
      return Response.json(
        { error: `Transcription provider failed (${response.status})` },
        { status: 502 },
      );
    }
    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (typeof transcript !== 'string') throw new Error('Invalid transcription response');
    return Response.json({ text: transcript });
  } catch (error) {
    console.error('[transcribe] Deepgram request failed:', error);
    return Response.json({ error: 'Transcription failed' }, { status: 502 });
  }
}
