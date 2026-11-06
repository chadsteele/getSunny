const allCapsWord = /\b[A-Z]{2,}\b/g;

export function normalizeForSpeech(text: string) {
  return text.replace(allCapsWord, (word) => `${[...word].join('.')}.`);
}
