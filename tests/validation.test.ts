import { describe, expect, it } from "vitest";
import { buildGoogleSearchUrl, normalizeKeywords, validateCaptureInput, validateResultCount } from "../src/shared/validation";

describe("validation", () => {
  it("normaliza keywords y elimina duplicados sin distinguir mayusculas", () => {
    expect(normalizeKeywords(" workstation que es \n\nWORKSTATION QUE ES\n gaming   workstation ")).toEqual([
      "workstation que es",
      "gaming workstation"
    ]);
  });

  it("valida el numero de resultados", () => {
    expect(validateResultCount("5")).toEqual({ ok: true, value: 5 });
    expect(validateResultCount("0").ok).toBe(false);
    expect(validateResultCount("11").ok).toBe(false);
    expect(validateResultCount("abc").ok).toBe(false);
  });

  it("rechaza entradas sin keywords", () => {
    expect(validateCaptureInput("\n ", "5").ok).toBe(false);
  });

  it("limita a veinte keywords por ejecucion", () => {
    const input = Array.from({ length: 21 }, (_, index) => `kw ${index}`).join("\n");
    expect(validateCaptureInput(input, "5").ok).toBe(false);
  });

  it("construye URL de busqueda con parametros esperados", () => {
    const url = new URL(buildGoogleSearchUrl("workstation que es", 5));
    expect(url.origin + url.pathname).toBe("https://www.google.com/search");
    expect(url.searchParams.get("q")).toBe("workstation que es");
    expect(url.searchParams.get("hl")).toBe("es");
    expect(url.searchParams.get("num")).toBe("5");
  });
});
