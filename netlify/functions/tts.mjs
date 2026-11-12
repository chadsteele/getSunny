import OpenAI from 'openai';

const audioCache = new Map();
const maxCachedAudio = 100;
const ttsModel = 'gpt-4o-mini-tts';
const ttsVoice = 'sage';
const ttsSpeed = 1.5;
const ttsInstructions =
  'Speak naturally and conversationally, like a warm, attentive person. Use a normal speaking pace with smooth transitions, natural emphasis, and brief pauses only where punctuation calls for them. Avoid drawn-out vowels, theatrical delivery, whispering, and long pauses.';

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function pcmToWav(pcm, sampleRate = 24_000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

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
    const input = normalizeText(text);
    if (!input) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const cacheKey = `${ttsModel}:${ttsVoice}:${ttsSpeed}:${input}`;
    let audioPromise = audioCache.get(cacheKey);
    if (!audioPromise) {
      console.log('[tts] Cache miss; requesting OpenAI audio');
      audioPromise = new OpenAI({ apiKey }).audio.speech
        .create({
          model: ttsModel,
          voice: ttsVoice,
          speed: ttsSpeed,
          input,
          instructions: ttsInstructions,
          response_format: 'pcm',
        })
        .then((speech) => speech.arrayBuffer())
        .then((audio) => pcmToWav(Buffer.from(audio)));
      audioCache.set(cacheKey, audioPromise);
      audioPromise.catch(() => audioCache.delete(cacheKey));
    } else {
      console.log('[tts] Cache hit; reusing generated audio');
    }

    const audio = await audioPromise;
    while (audioCache.size > maxCachedAudio) {
      audioCache.delete(audioCache.keys().next().value);
    }
    return new Response(audio, {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'audio/wav',
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
