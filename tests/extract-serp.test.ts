import { describe, expect, it } from "vitest";
import { extractGoogleOrganicResults, normalizeHttpUrl } from "../src/content/extract-serp";

function documentFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("extractGoogleOrganicResults", () => {
  it("extrae resultados organicos desde un fixture minimo", () => {
    const doc = documentFromHtml(`
      <main>
        <div class="g">
          <a href="https://example.com/article#section"><h3>Titulo visible</h3></a>
          <div class="VwiC3b">Fragmento visible del resultado organico.</div>
        </div>
        <div class="g">
          <a href="https://www.example.org/page"><h3>Segundo resultado</h3></a>
          <div class="VwiC3b">Otro fragmento visible suficientemente descriptivo.</div>
        </div>
      </main>
    `);

    const response = extractGoogleOrganicResults(doc, 5);

    expect(response.results).toEqual([
      {
        position: 1,
        title: "Titulo visible",
        url: "https://example.com/article",
        domain: "example.com",
        snippet: "Fragmento visible del resultado organico.",
        type: "organic"
      },
      {
        position: 2,
        title: "Segundo resultado",
        url: "https://www.example.org/page",
        domain: "example.org",
        snippet: "Otro fragmento visible suficientemente descriptivo.",
        type: "organic"
      }
    ]);
  });

  it("filtra anuncios, URLs internas de Google, enlaces invalidos y duplicados", () => {
    const doc = documentFromHtml(`
      <main>
        <div class="g"><span>Anuncio</span><a href="https://ad.example.com"><h3>Anuncio ejemplo</h3></a></div>
        <div class="g"><a href="https://www.google.com/search?q=cache"><h3>Google interno</h3></a></div>
        <div class="g"><a href="mailto:test@example.com"><h3>Email</h3></a></div>
        <div class="g"><a href="https://example.com/page"><h3>Resultado unico</h3></a><div class="VwiC3b">Snippet valido con texto visible y completo.</div></div>
        <div class="g"><a href="https://example.com/page"><h3>Duplicado</h3></a><div class="VwiC3b">Snippet duplicado.</div></div>
      </main>
    `);

    const response = extractGoogleOrganicResults(doc, 10);

    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.title).toBe("Resultado unico");
  });

  it("respeta el limite solicitado", () => {
    const doc = documentFromHtml(`
      <div class="g"><a href="https://a.example.com"><h3>A</h3></a></div>
      <div class="g"><a href="https://b.example.com"><h3>B</h3></a></div>
    `);

    expect(extractGoogleOrganicResults(doc, 1).results).toHaveLength(1);
  });

  it("detecta consentimiento y CAPTCHA sin capturar", () => {
    const consent = extractGoogleOrganicResults(documentFromHtml("<body>Antes de ir a Google</body>"), 5);
    const captcha = extractGoogleOrganicResults(documentFromHtml("<title>Sorry</title><body>unusual traffic</body>"), 5);

    expect(consent.results).toHaveLength(0);
    expect(consent.warnings[0]).toContain("consentimiento");
    expect(captcha.results).toHaveLength(0);
    expect(captcha.warnings[0]).toContain("CAPTCHA");
  });

  it("normaliza URLs de redireccion de Google y rechaza internas", () => {
    expect(normalizeHttpUrl("https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fpost%23x")).toBe("https://example.com/post");
    expect(normalizeHttpUrl("https://www.google.com/search?q=test")).toBeNull();
  });

  it("elimina srsltid", () => {
    expect(normalizeHttpUrl("https://example.com/page?srsltid=abc")).toBe("https://example.com/page");
  });

  it("elimina varios parametros utm", () => {
    expect(normalizeHttpUrl("https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=summer&utm_term=pc&utm_content=ad")).toBe("https://example.com/page");
  });

  it("elimina gclid y fbclid", () => {
    expect(normalizeHttpUrl("https://example.com/page?gclid=one&fbclid=two")).toBe("https://example.com/page");
  });

  it("compara parametros sin distinguir mayusculas", () => {
    expect(normalizeHttpUrl("https://example.com/page?UTM_Source=google&SrsltId=abc&GCLID=one")).toBe("https://example.com/page");
  });

  it("elimina el fragmento", () => {
    expect(normalizeHttpUrl("https://example.com/page?id=42#section")).toBe("https://example.com/page?id=42");
  });

  it("conserva parametros funcionales", () => {
    expect(normalizeHttpUrl("https://example.com/shop?per_page=9&orderby=popularity")).toBe("https://example.com/shop?per_page=9&orderby=popularity");
  });

  it("conserva URL sin tracking", () => {
    expect(normalizeHttpUrl("https://example.com/path?id=42")).toBe("https://example.com/path?id=42");
  });

  it("deduplica dos URLs que solo difieren por tracking", () => {
    const doc = documentFromHtml(`
      <div class="g"><a href="https://example.com/page?id=42&utm_source=google"><h3>Resultado limpio</h3></a></div>
      <div class="g"><a href="https://example.com/page?id=42&srsltid=abc#section"><h3>Resultado con tracking</h3></a></div>
    `);

    const response = extractGoogleOrganicResults(doc, 10);

    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.url).toBe("https://example.com/page?id=42");
  });

  it("conserva parametros funcionales y elimina tracking mezclado", () => {
    expect(normalizeHttpUrl("https://example.com/shop?per_page=9&utm_medium=cpc&orderby=popularity&srsltid=abc")).toBe(
      "https://example.com/shop?per_page=9&orderby=popularity"
    );
  });

  it("rechaza protocolos distintos de HTTP y HTTPS", () => {
    expect(normalizeHttpUrl("ftp://example.com/file")).toBeNull();
    expect(normalizeHttpUrl("mailto:test@example.com")).toBeNull();
  });
});
