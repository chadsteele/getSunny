export type UsageRecord = {
  service: 'llm' | 'stt' | 'tts';
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  audioSeconds: number | null;
  estimatedTokens: boolean;
  estimatedCostUsd: number | null;
};

const rates = {
  llmInput: 1.4,
  llmOutput: 4.4,
  ttsInput: 0.6,
  ttsOutput: 12,
  sttPerMinute: 0.0043,
};

export function unknownUsage(service: UsageRecord['service']): UsageRecord {
  const model = { llm: 'zai-org-glm-5-2', stt: 'nova-3', tts: 'gpt-4o-mini-tts' }[service];
  return {
    service,
    model,
    inputTokens: null,
    outputTokens: null,
    audioSeconds: null,
    estimatedTokens: service === 'tts',
    estimatedCostUsd: null,
  };
}

export function llmUsage(inputTokens: number, outputTokens: number): UsageRecord {
  if (![inputTokens, outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('Invalid language model usage.');
  }
  return {
    service: 'llm',
    model: 'zai-org-glm-5-2',
    inputTokens,
    outputTokens,
    audioSeconds: null,
    estimatedTokens: false,
    estimatedCostUsd: (inputTokens * rates.llmInput + outputTokens * rates.llmOutput) / 1_000_000,
  };
}

export function sttUsage(audioSeconds: number): UsageRecord {
  if (!Number.isFinite(audioSeconds) || audioSeconds < 0) {
    throw new Error('Invalid transcription duration.');
  }
  return {
    service: 'stt',
    model: 'nova-3',
    inputTokens: null,
    outputTokens: null,
    audioSeconds,
    estimatedTokens: false,
    estimatedCostUsd: (audioSeconds / 60) * rates.sttPerMinute,
  };
}

export function ttsUsage(text: string, instructionCharacters: number): UsageRecord {
  // The speech endpoint does not report usage. These are rough, language-dependent estimates.
  if (!Number.isSafeInteger(instructionCharacters) || instructionCharacters < 0) {
    throw new Error('Invalid speech instruction length.');
  }
  const inputTokens = Math.ceil((text.length + instructionCharacters) / 4);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const audioSeconds = (words / (150 * 1.3)) * 60;
  const outputTokens = Math.ceil(audioSeconds * 25);
  return {
    service: 'tts',
    model: 'gpt-4o-mini-tts',
    inputTokens,
    outputTokens,
    audioSeconds,
    estimatedTokens: true,
    estimatedCostUsd: (inputTokens * rates.ttsInput + outputTokens * rates.ttsOutput) / 1_000_000,
  };
}

export function isUsageRecord(value: unknown): value is UsageRecord {
  if (!value || typeof value !== 'object') return false;
  const u = value as Partial<UsageRecord>;
  const validNumber = (n: unknown) =>
    n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0);
  return (
    (u.service === 'llm' || u.service === 'stt' || u.service === 'tts') &&
    typeof u.model === 'string' &&
    validNumber(u.inputTokens) &&
    validNumber(u.outputTokens) &&
    validNumber(u.audioSeconds) &&
    typeof u.estimatedTokens === 'boolean' &&
    validNumber(u.estimatedCostUsd)
  );
}

export function summarizeUsage(records: readonly UsageRecord[]) {
  return {
    requests: records.length,
    inputTokens: records.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0),
    outputTokens: records.reduce((sum, item) => sum + (item.outputTokens ?? 0), 0),
    audioSeconds: records.reduce((sum, item) => sum + (item.audioSeconds ?? 0), 0),
    estimatedCostUsd: records.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0),
    unknownCosts: records.filter((item) => item.estimatedCostUsd === null).length,
    unknownTokenRequests: records.filter(
      (item) => item.service !== 'stt' && item.inputTokens === null,
    ).length,
    estimatedTokenRequests: records.filter((item) => item.estimatedTokens).length,
    services: (['stt', 'llm', 'tts'] as const).map((service) => {
      const selected = records.filter((item) => item.service === service);
      return {
        service,
        requests: selected.length,
        inputTokens: selected.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0),
        outputTokens: selected.reduce((sum, item) => sum + (item.outputTokens ?? 0), 0),
        audioSeconds: selected.reduce((sum, item) => sum + (item.audioSeconds ?? 0), 0),
        estimatedCostUsd: selected.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0),
      };
    }),
  };
}
