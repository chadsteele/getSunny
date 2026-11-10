import { GoogleGenAI } from '@google/genai';

export default async function chatStream(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const { systemPrompt, history, prompt } = await request.json();
    const ai = new GoogleGenAI({ apiKey });
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash-lite',
      contents: [
        ...(Array.isArray(history) ? history : []),
        { role: 'user', parts: [{ text: String(prompt ?? '') }] },
      ],
      config: {
        systemInstruction: String(systemPrompt ?? ''),
        temperature: 0.35,
      },
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(body, {
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'text/plain; charset=utf-8',
        'transfer-encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('[chat-stream] Gemini request failed:', error);
    const status = Number.isInteger(error?.status) ? error.status : 502;
    const message =
      typeof error?.error?.message === 'string' ? error.error.message : 'Chat generation failed';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
