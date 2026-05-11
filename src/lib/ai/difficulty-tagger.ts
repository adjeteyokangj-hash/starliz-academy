export function tagDifficulty(text: string, fallback = 1) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const averageLength = words.length ? words.reduce((total, word) => total + word.length, 0) / words.length : 0;
  const longWords = words.filter((word) => word.length >= 8).length;
  const score = Math.round(Math.min(5, Math.max(1, fallback + averageLength / 5 + longWords / 4)));
  return score;
}

export function tagTopic(text: string) {
  const lower = text.toLowerCase();
  if (/(fraction|divide|multiply|sum|add|subtract|number)/.test(lower)) return "maths";
  if (/(phonics|spell|word|sound|syllable)/.test(lower)) return "spelling";
  if (/(passage|story|read|comprehension)/.test(lower)) return "reading";
  return "mixed";
}
