export type OutputReviewCategory = "NOT_EVALUATED" | "SUFFICIENTLY_ALIGNED" | "NEEDS_REVIEW" | "QUESTIONABLE";

export type OutputComparison = {
  score: number;
  category: OutputReviewCategory;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, " ")
    .trim();
}

function toTokens(value: string) {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function toBigrams(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 2) return new Set(compact ? [compact] : []);
  const result = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) result.add(compact.slice(index, index + 2));
  return result;
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let count = 0;
  left.forEach((value) => { if (right.has(value)) count += 1; });
  return count;
}

function dice(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  return (2 * intersectionSize(left, right)) / (left.size + right.size);
}

export function compareTaskOutput(outputTarget: unknown, outputResult: unknown): OutputComparison {
  const target = normalizeText(outputTarget);
  const result = normalizeText(outputResult);
  if (!target || !result) return { score: 0, category: "NOT_EVALUATED" };

  const targetTokens = toTokens(target);
  const resultTokens = toTokens(result);
  const sharedTokens = intersectionSize(targetTokens, resultTokens);
  const score = Math.round(Math.min(1,
    dice(targetTokens, resultTokens) * 0.45 +
    (targetTokens.size ? sharedTokens / targetTokens.size : 0) * 0.30 +
    dice(toBigrams(target), toBigrams(result)) * 0.25
  ) * 10000) / 100;

  return {
    score,
    category: score >= 70 ? "SUFFICIENTLY_ALIGNED" : score >= 40 ? "NEEDS_REVIEW" : "QUESTIONABLE",
  };
}

export function outputReviewLabel(category?: string) {
  if (category === "SUFFICIENTLY_ALIGNED") return "Cukup Sesuai";
  if (category === "NEEDS_REVIEW") return "Perlu Pengecekan";
  if (category === "QUESTIONABLE") return "Perlu Dipertanyakan";
  return "Belum Dinilai";
}
