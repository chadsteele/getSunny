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
const paragraphEnd = /\r?\n[^\S\r\n]*\r?\n/;

export function splitSentences(text: string) {
  const sentences: string[] = [];
  let remaining = text.trimStart();
  let paragraph = remaining.match(paragraphEnd);
  while (paragraph && paragraph.index !== undefined) {
    const bullet = remaining.match(bulletStart);
    if (bullet && paragraph.index < bullet[0].length) {
      remaining = remaining.slice(bullet[0].length);
      paragraph = remaining.match(paragraphEnd);
      continue;
    }
    const split = splitSentenceFragment(remaining.slice(0, paragraph.index));
    sentences.push(...split.sentences);
    if (split.remaining.trim()) sentences.push(split.remaining.trim());
    remaining = remaining.slice(paragraph.index + paragraph[0].length).trimStart();
    paragraph = remaining.match(paragraphEnd);
  }
  const split = splitSentenceFragment(remaining);
  return { sentences: [...sentences, ...split.sentences], remaining: split.remaining };
}

function splitSentenceFragment(text: string) {
  const sentences: string[] = [];
  let remaining = text.trimStart();

  while (remaining) {
    const bullet = remaining.match(bulletStart);
    if (bullet) {
      const contentStart = bullet[0].length;
      const next = remaining.slice(contentStart).search(nextBullet);
      if (next >= 0) {
        sentences.push(remaining.slice(contentStart, contentStart + next).trim());
        remaining = remaining.slice(contentStart + next).trimStart();
      } else {
        sentences.push(remaining.slice(contentStart).trim());
        remaining = '';
      }
      continue;
    }

    const bulletIndex = remaining.search(nextBullet);
    if (bulletIndex > 0) {
      sentences.push(remaining.slice(0, bulletIndex).trim());
      remaining = remaining.slice(bulletIndex).trimStart();
      continue;
    }

    while (remaining.length >= 200 || sentenceEnd.test(remaining)) {
      const match = remaining.match(/^([\s\S]{1,200}?(?:[!?]|(?<!\b[A-Z])\.))(?:\s|$)/);
      if (!match) {
        if (remaining.length < 200) break;
        const boundary = remaining.slice(0, 201).match(/^([\s\S]{1,200})\s/);
        if (boundary) {
          sentences.push(boundary[1].trim());
          remaining = remaining.slice(boundary[0].length).trimStart();
        } else {
          const nextSpace = remaining.search(/\s/);
          if (nextSpace < 0) {
            sentences.push(remaining);
            remaining = '';
          } else {
            sentences.push(remaining.slice(0, nextSpace));
            remaining = remaining.slice(nextSpace).trimStart();
          }
        }
      } else {
        const sentence = match[1].trim();
        if (!/\s/.test(sentence)) break;
        sentences.push(sentence);
        remaining = remaining.slice(match[0].length).trimStart();
      }
    }
    break;
  }

  return { sentences: sentences.filter(Boolean), remaining };
}
