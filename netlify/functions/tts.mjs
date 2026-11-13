import OpenAI from 'openai';

export default async function tts(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const apiKey = process.env.SUNNY_OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'SUNNY_OPENAI_API_KEY is not configured' }, { status: 500 });
  }
  try {
    const { text } = await request.json();
    if (typeof text !== 'string' || !text.trim()) {
      return Response.json({ error: 'Text is required' }, { status: 400 });
    }
    const speech = await new OpenAI({ apiKey }).audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'nova',
      speed: 1.3,
      input: text.trim(),
      instructions:
        'Speak naturally and conversationally, like a warm, attentive person. Use a normal speaking pace with smooth transitions, natural emphasis, and brief pauses only where punctuation calls for them.',
      response_format: 'mp3',
    });
    return new Response(await speech.arrayBuffer(), {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('[tts] OpenAI request failed:', error);
    return Response.json({ error: 'Speech synthesis failed' }, { status: 502 });
  }
}
