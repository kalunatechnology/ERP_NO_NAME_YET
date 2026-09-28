export type OutputReviewCategory = 'NOT_EVALUATED' | 'SUFFICIENTLY_ALIGNED' | 'NEEDS_REVIEW' | 'QUESTIONABLE';

export interface OutputComparisonResult {
  score: number;
  category: OutputReviewCategory;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function bigrams(value: string): Set<string> {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 2) return new Set(compact ? [compact] : []);
  const values = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) values.add(compact.slice(index, index + 2));
  return values;
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function dice(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  return (2 * intersectionSize(left, right)) / (left.size + right.size);
}

/**
 * Deterministic text comparison for an expected deliverable and its reported
 * result. It combines word overlap, target-word coverage, and character
 * bigrams so long unrelated boilerplate cannot receive a high score merely by
 * repeating a few target words.
 */
export function compareTaskOutput(outputTarget: unknown, outputResult: unknown): OutputComparisonResult {
  const target = normalizeText(outputTarget);
  const result = normalizeText(outputResult);
  if (!target || !result) return { score: 0, category: 'NOT_EVALUATED' };

  const targetTokens = tokens(target);
  const resultTokens = tokens(result);
  const sharedTokens = intersectionSize(targetTokens, resultTokens);
  const tokenDice = dice(targetTokens, resultTokens);
  const targetCoverage = targetTokens.size ? sharedTokens / targetTokens.size : 0;
  const characterDice = dice(bigrams(target), bigrams(result));
  const score = Math.round(Math.min(1, tokenDice * 0.45 + targetCoverage * 0.30 + characterDice * 0.25) * 10000) / 100;

  return {
    score,
    category: score >= 70 ? 'SUFFICIENTLY_ALIGNED' : score >= 40 ? 'NEEDS_REVIEW' : 'QUESTIONABLE',
  };
}
