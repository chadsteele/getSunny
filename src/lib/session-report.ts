export const reportSystemPrompt = `During the conversation, remember the user's preferred name, their dream,
their satisfaction rating from 1 to 5, and their feedback about the experience.

When explicitly asked to produce a session report, return only a valid JSON
object with exactly these fields:

{
  "name": string or null,
  "summary": string,
  "rank": integer from 1 to 5 or null,
  "comments": string or null
}

Use only information the user actually provided. Do not invent a name,
rating, or feedback. Use null when a value is unknown. The summary should
describe the user's dream and key details; if there is not enough information,
use an empty string. Do not include markdown fences or explanatory text.`;

export interface SessionReport {
  name: string | null;
  summary: string;
  rank: number | null;
  comments: string | null;
}

export function parseSessionReport(text: string): SessionReport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The report is not valid JSON.');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    !('name' in value) ||
    !(typeof value.name === 'string' || value.name === null) ||
    !('summary' in value) ||
    typeof value.summary !== 'string' ||
    !('rank' in value) ||
    !(
      value.rank === null ||
      (typeof value.rank === 'number' &&
        Number.isInteger(value.rank) &&
        value.rank >= 1 &&
        value.rank <= 5)
    ) ||
    !('comments' in value) ||
    !(typeof value.comments === 'string' || value.comments === null)
  ) {
    throw new Error('The report does not match the required format.');
  }
  return {
    name: value.name,
    summary: value.summary,
    rank: value.rank,
    comments: value.comments,
  };
}
