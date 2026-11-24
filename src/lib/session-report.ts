export const reportSystemPrompt = `Review the conversation to identify the user's preferred name, the main topics and
key details they shared,
their satisfaction rating from 1 to 5, and their feedback about the experience.

When explicitly asked to produce a session report, return only a valid JSON
object with exactly these fields:

{
  "name": string or null,
  "phonetic_name": string or null,
  "summary": string,
  "major_insights": string or null,
  "rank": integer from 1 to 5 or null,
  "comments": string or null
}

Use only information the user actually provided. Prefer the name the user requested in the conversation.
Do not invent a name, rating, or feedback. Use null when a value is unknown.
Summarize the relevant details the user shared in this session, even if the session
is incomplete or is not about a dream. Use an empty summary only when the user
has not shared any relevant details. Do not include markdown fences or explanatory text.`;

export interface SessionReport {
  name: string | null;
  phonetic_name: string | null;
  summary: string;
  major_insights: string | null;
  rank: number | null;
  comments: string | null;
}

export function reportTimestamps(messages: readonly ChatMessage[]) {
  return {
    firstTimestamp: messages[0]?.timestamp ?? null,
    lastTimestamp: messages.at(-1)?.timestamp ?? null,
  };
}

export function reportTotals(
  timestamps: { firstTimestamp: string | null; lastTimestamp: string | null },
  usage: Pick<
    ReturnType<typeof summarizeUsage>,
    'inputTokens' | 'outputTokens' | 'estimatedCostUsd'
  >,
) {
  const first = timestamps.firstTimestamp === null ? NaN : Date.parse(timestamps.firstTimestamp);
  const last = timestamps.lastTimestamp === null ? NaN : Date.parse(timestamps.lastTimestamp);
  return {
    totalTimeSeconds:
      Number.isFinite(first) && Number.isFinite(last) && last >= first
        ? (last - first) / 1000
        : null,
    totalTokens: usage.inputTokens + usage.outputTokens,
    totalEstimatedCostUsd: usage.estimatedCostUsd,
  };
}

export function parseSessionReport(text: string): SessionReport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The report is not valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The report does not match the required format.');
  }

  const name = 'name' in value && (typeof value.name === 'string' || value.name === null) ? value.name : null;
  const summary = 'summary' in value && typeof value.summary === 'string' ? value.summary : '';
  const rank = 'rank' in value && (value.rank === null || (typeof value.rank === 'number' && Number.isInteger(value.rank) && value.rank >= 1 && value.rank <= 5)) ? value.rank : null;
  const comments = 'comments' in value && (typeof value.comments === 'string' || value.comments === null) ? value.comments : null;

  if (summary === '') {
    throw new Error('The report does not match the required format.');
  }

  return {
    name,
    phonetic_name: 'phonetic_name' in value && (typeof value.phonetic_name === 'string' || value.phonetic_name === null) ? value.phonetic_name : null,
    summary,
    major_insights: 'major_insights' in value && (typeof value.major_insights === 'string' || value.major_insights === null) ? value.major_insights : null,
    rank,
    comments,
  };
}
import type { ChatMessage } from './chat-thread-store.svelte';
import type { summarizeUsage } from './usage';
