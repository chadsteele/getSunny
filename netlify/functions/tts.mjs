import OpenAI from 'openai';

export default async function tts(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const apiKey = process.env.SUNNY_OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SUNNY_OPENAI_API_KEY is not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const { text } = await request.json();
    const speech = await new OpenAI({ apiKey }).audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: String(text ?? ''),
      response_format: 'mp3',
    });
    return new Response(speech.body, {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'audio/mpeg',
      },
    });
  } catch (error) {
    console.error('[tts] OpenAI request failed:', error);
    const status = Number.isInteger(error?.status) ? error.status : 502;
    const message =
      typeof error?.error?.message === 'string' ? error.error.message : 'Speech synthesis failed';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
