import type { CaptureOptions } from "./types";

export const DEFAULT_RESULT_COUNT = 5;
export const MAX_RESULT_COUNT = 10;
export const MAX_KEYWORDS = 20;

export interface ValidationResult {
  ok: boolean;
  options?: CaptureOptions;
  errors: string[];
}

export function normalizeKeywords(input: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const keyword = rawLine.trim().replace(/\s+/g, " ");
    if (!keyword) {
      continue;
    }

    const key = keyword.toLocaleLowerCase("es-ES");
    if (!seen.has(key)) {
      seen.add(key);
      keywords.push(keyword);
    }
  }

  return keywords;
}

export function validateResultCount(value: string | number): { ok: boolean; value?: number; error?: string } {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return { ok: false, error: "El numero de resultados debe ser un entero." };
  }

  if (parsed < 1 || parsed > MAX_RESULT_COUNT) {
    return { ok: false, error: `El numero de resultados debe estar entre 1 y ${MAX_RESULT_COUNT}.` };
  }

  return { ok: true, value: parsed };
}

export function validateCaptureInput(keywordInput: string, resultCountInput: string | number): ValidationResult {
  const errors: string[] = [];
  const keywords = normalizeKeywords(keywordInput);
  const count = validateResultCount(resultCountInput);

  if (keywords.length === 0) {
    errors.push("Introduce al menos una keyword.");
  }

  if (keywords.length > MAX_KEYWORDS) {
    errors.push(`Usa como maximo ${MAX_KEYWORDS} keywords por ejecucion.`);
  }

  if (!count.ok || count.value === undefined) {
    errors.push(count.error ?? "El numero de resultados no es valido.");
  }

  if (errors.length > 0 || count.value === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    options: {
      keywords,
      requestedResultCount: count.value
    },
    errors: []
  };
}

export function buildGoogleSearchUrl(keyword: string, requestedResultCount: number): string {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", keyword);
  url.searchParams.set("hl", "es");
  url.searchParams.set("num", String(Math.min(Math.max(requestedResultCount, 1), MAX_RESULT_COUNT)));
  return url.toString();
}

export function toSafeTimestampForFilename(isoDate: string): string {
  return isoDate.replace(/[:.]/g, "").replace(/[^0-9TZ-]/g, "");
}
