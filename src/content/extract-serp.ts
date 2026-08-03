import type { ExtractRequest, ExtractResponse, SerpResult } from "../shared/types";

const GOOGLE_HOST_SUFFIXES = [".google.com", ".google.es"];
const INTERNAL_GOOGLE_PATHS = [
  "/search",
  "/preferences",
  "/setprefs",
  "/advanced_search",
  "/url",
  "/imgres",
  "/maps",
  "/shopping"
];
const TRACKING_PARAM_NAMES = new Set([
  "srsltid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid"
]);

interface Candidate {
  title: string;
  url: string;
  snippet: string | null;
}

export function normalizeHttpUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl, window.location.href);

    if (parsed.hostname.endsWith("google.com") && parsed.pathname === "/url") {
      const target = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
      return target ? normalizeHttpUrl(target) : null;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (isInternalGoogleUrl(parsed)) {
      return null;
    }

    parsed.hash = "";
    removeTrackingParams(parsed);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getDomain(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isInternalGoogleUrl(url: URL): boolean {
  const host = url.hostname.toLocaleLowerCase("en-US");
  const isGoogleHost = host === "google.com" || host === "google.es" || GOOGLE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));

  if (!isGoogleHost) {
    return false;
  }

  return INTERNAL_GOOGLE_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
}

function removeTrackingParams(url: URL): void {
  const paramsToDelete = Array.from(url.searchParams.keys()).filter((name) => TRACKING_PARAM_NAMES.has(name.toLocaleLowerCase("en-US")));

  for (const name of paramsToDelete) {
    url.searchParams.delete(name);
  }
}

export function extractGoogleOrganicResults(documentRef: Document, requestedResultCount: number): ExtractResponse {
  const warnings = detectBlockingStates(documentRef);
  if (warnings.length > 0) {
    return { results: [], warnings };
  }

  const candidates = collectCandidates(documentRef);
  const seenUrls = new Set<string>();
  const results: SerpResult[] = [];

  for (const candidate of candidates) {
    if (results.length >= requestedResultCount) {
      break;
    }

    const normalizedUrl = normalizeHttpUrl(candidate.url);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
      continue;
    }

    const title = candidate.title.trim();
    const domain = getDomain(normalizedUrl);
    if (!title || !domain) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    results.push({
      position: results.length + 1,
      title,
      url: normalizedUrl,
      domain,
      snippet: candidate.snippet,
      type: "organic"
    });
  }

  if (results.length === 0) {
    warnings.push("No se encontraron resultados organicos visibles con la estructura esperada.");
  } else if (results.length < requestedResultCount) {
    warnings.push(`Solo se capturaron ${results.length} resultados organicos visibles de ${requestedResultCount} solicitados.`);
  }

  return { results, warnings };
}

function detectBlockingStates(documentRef: Document): string[] {
  const warnings: string[] = [];
  const text = (documentRef.body?.innerText ?? "").toLocaleLowerCase("es-ES");
  const title = documentRef.title.toLocaleLowerCase("es-ES");

  if (documentRef.querySelector('form[action*="consent"], [aria-label*="consent" i], [data-testid*="consent" i]') || text.includes("antes de ir a google") || text.includes("before you continue to google")) {
    warnings.push("Google muestra una pantalla de consentimiento. Requiere interaccion humana en la pestana abierta.");
  }

    if (documentRef.querySelector('form[action*="sorry"], iframe[src*="recaptcha"]') || text.includes("trafico inusual") || text.includes("tráfico inusual") || text.includes("unusual traffic") || title.includes("sorry")) {
    warnings.push("Google muestra una proteccion CAPTCHA o de trafico inusual. No se intenta resolver automaticamente.");
  }

  if (text.includes("no se han encontrado resultados") || text.includes("did not match any documents")) {
    warnings.push("Google informa que no hay resultados para esta busqueda.");
  }

  if (title.includes("error") || text.includes("se ha producido un error")) {
    warnings.push("La pagina de Google parece mostrar un error.");
  }

  return warnings;
}

function collectCandidates(documentRef: Document): Candidate[] {
  const candidates: Candidate[] = [];
  const blocks = documentRef.querySelectorAll<HTMLElement>("div.g, div.MjjYud, div[data-sokoban-container] div");

  for (const block of blocks) {
    if (!isVisible(block) || looksLikeAd(block)) {
      continue;
    }

    const link = findResultLink(block);
    const titleElement = block.querySelector<HTMLElement>("h3");
    const title = titleElement?.innerText ?? "";

    if (!link || !titleElement || !isVisible(titleElement)) {
      continue;
    }

    candidates.push({
      title,
      url: link.href,
      snippet: findSnippet(block, titleElement)
    });
  }

  if (candidates.length === 0) {
    return collectFallbackCandidates(documentRef);
  }

  return candidates;
}

function collectFallbackCandidates(documentRef: Document): Candidate[] {
  const candidates: Candidate[] = [];
  const headings = documentRef.querySelectorAll<HTMLHeadingElement>("h3");

  for (const heading of headings) {
    if (!isVisible(heading)) {
      continue;
    }

    const link = heading.closest("a") ?? heading.parentElement?.closest("a");
    const block = heading.closest<HTMLElement>("div.g, div.MjjYud, div[data-sokoban-container], div");

    if (!link || !block || looksLikeAd(block)) {
      continue;
    }

    candidates.push({
      title: heading.innerText,
      url: link.href,
      snippet: findSnippet(block, heading)
    });
  }

  return candidates;
}

function findResultLink(block: HTMLElement): HTMLAnchorElement | null {
  const links = Array.from(block.querySelectorAll<HTMLAnchorElement>("a[href]"));

  return links.find((link) => {
    const heading = link.querySelector("h3");
    return Boolean(heading && isVisible(link) && normalizeHttpUrl(link.href));
  }) ?? null;
}

function findSnippet(block: HTMLElement, titleElement: HTMLElement): string | null {
  const selectors = [
    "[data-sncf]",
    ".VwiC3b",
    ".aCOpRe",
    ".IsZvec",
    "div[style*='-webkit-line-clamp']"
  ];

  for (const selector of selectors) {
    const element = block.querySelector<HTMLElement>(selector);
    const snippet = cleanSnippet(element?.innerText ?? "");
    if (element && isVisible(element) && snippet && !snippet.includes(titleElement.innerText.trim())) {
      return snippet;
    }
  }

  const titleText = titleElement.innerText.trim();
  const textBlocks = Array.from(block.querySelectorAll<HTMLElement>("span, div"))
    .filter((element) => isVisible(element))
    .map((element) => cleanSnippet(element.innerText))
    .filter((text) => text && text !== titleText && !text.startsWith("http") && text.length > 35);

  return textBlocks[0] ?? null;
}

function looksLikeAd(block: HTMLElement): boolean {
  const text = (block.innerText ?? "").trim().toLocaleLowerCase("es-ES");
  const aria = (block.getAttribute("aria-label") ?? "").toLocaleLowerCase("es-ES");

  return (
    block.matches("[data-text-ad], [aria-label*='anuncio' i], [aria-label*='ad' i]") ||
    aria.includes("anuncio") ||
    text.startsWith("anuncio") ||
    text.startsWith("patrocinado") ||
    text.includes("\nanuncio\n") ||
    text.includes("\nsponsored\n")
  );
}

function cleanSnippet(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtractRequest, _sender, sendResponse: (response: ExtractResponse) => void) => {
    if (typeof message?.requestedResultCount !== "number") {
      return false;
    }

    sendResponse(extractGoogleOrganicResults(document, message.requestedResultCount));
    return false;
  });
}
