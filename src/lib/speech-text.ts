const allCapsWord = /\b[A-Z]{2,}\b/g;

export function normalizeForDisplay(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_~|]/g, ' ')
    .replace(/[—–]/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u200D\uFE0E\uFE0F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForSpeech(text: string) {
  return normalizeForDisplay(text).replace(allCapsWord, (word) => `${[...word].join('. ')}.`);
}

const bulletStart = /^(?:[-*+]|\d+[.)])\s+/;
const nextBullet = /\n\s*(?:[-*+]|\d+[.)])\s+/;
const sentenceEnd = /[.!?](?:\s|$)/;

export function splitSentences(text: string) {
  const sentences: string[] = [];
  let remaining = text.trim();

  while (remaining) {
    const bullet = remaining.match(bulletStart);
    if (bullet) {
      const contentStart = bullet[0].length;
      const next = remaining.slice(contentStart).search(nextBullet);
      if (next >= 0) {
        sentences.push(remaining.slice(contentStart, contentStart + next).trim());
        remaining = remaining.slice(contentStart + next).trim();
      } else {
        sentences.push(remaining.slice(contentStart).trim());
        remaining = '';
      }
      continue;
    }

    const bulletIndex = remaining.search(nextBullet);
    if (bulletIndex > 0) {
      sentences.push(remaining.slice(0, bulletIndex).trim());
      remaining = remaining.slice(bulletIndex).trim();
      continue;
    }

    while (remaining.length >= 200 || sentenceEnd.test(remaining)) {
      const match = remaining.match(/^([\s\S]{1,200}?(?:[!?]|(?<!\b[A-Z])\.))(?:\s|$)/);
      if (!match) {
        if (remaining.length < 200) break;
        sentences.push(remaining.slice(0, 200).trim());
        remaining = remaining.slice(200).trim();
      } else {
        const sentence = match[1].trim();
        if (!/\s/.test(sentence)) break;
        sentences.push(sentence);
        remaining = remaining.slice(match[0].length).trim();
      }
    }
    break;
  }

  return { sentences: sentences.filter(Boolean), remaining };
}
