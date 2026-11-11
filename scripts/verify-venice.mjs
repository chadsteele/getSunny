import OpenAI from 'openai';

const apiKey = process.env.VENICE_API_KEY;
if (!apiKey) {
  throw new Error('VENICE_API_KEY is not configured');
}

const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.venice.ai/api/v1',
});

const completion = await client.chat.completions.create({
  model: 'zai-org-glm-5-2',
  messages: [{ role: 'user', content: 'Reply with exactly: Venice connection verified.' }],
  max_tokens: 32,
});

console.log(completion.choices[0]?.message?.content ?? 'No response content returned.');
