import { DeepgramClient } from '@deepgram/sdk';

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
    const deepgram = new DeepgramClient({ apiKey });
    const result = await deepgram.listen.v1.media.transcribeFile(audio, {
      model: 'nova-3',
      smart_format: true,
      punctuate: true,
    });
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
