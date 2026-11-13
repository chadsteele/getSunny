import OpenAI from 'openai';
import { logger as console } from '../../logger.mjs';

export default async function chatStream(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'VENICE_API_KEY is not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const { systemPrompt, history, prompt } = await request.json();
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.venice.ai/api/v1',
    });
    const stream = await client.chat.completions.create({
      model: 'zai-org-glm-5-2',
      messages: [
        { role: 'system', content: String(systemPrompt ?? '') },
        ...(Array.isArray(history)
          ? history.map((message) => ({
              role: message.role === 'model' ? 'assistant' : 'user',
              content: String(message.parts?.[0]?.text ?? ''),
            }))
          : []),
        { role: 'user', content: String(prompt ?? '') },
      ],
      temperature: 0.35,
      stream: true,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
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
    console.error('[chat-stream] Venice request failed:', error);
    const status = Number.isInteger(error?.status) ? error.status : 502;
    const message =
      typeof error?.error?.message === 'string' ? error.error.message : 'Chat generation failed';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
