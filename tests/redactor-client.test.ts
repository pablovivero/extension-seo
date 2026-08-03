import { beforeEach, describe, expect, it, vi } from "vitest";
import { REDACTOR_MESSAGES, sendCaptureToRedactor } from "../src/shared/redactor-client";
import type { SerpCapture } from "../src/shared/types";

const capture: SerpCapture = {
  schemaVersion: "1.0",
  capturedAt: "2026-08-03T10:00:00.000Z",
  engine: "google",
  locale: "es-ES",
  queries: []
};

describe("sendCaptureToRedactor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("envia la captura con bearer token al endpoint local", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await sendCaptureToRedactor(capture, " secret ");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:43187/serp", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(capture)
    });
  });

  it("rechaza envios sin secreto", async () => {
    await expect(sendCaptureToRedactor(capture, "")).rejects.toThrow(REDACTOR_MESSAGES.missingSecret);
  });

  it("traduce errores de conexion", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(sendCaptureToRedactor(capture, "secret")).rejects.toThrow(REDACTOR_MESSAGES.connectionRefused);
  });

  it("traduce secretos invalidos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    await expect(sendCaptureToRedactor(capture, "secret")).rejects.toThrow(REDACTOR_MESSAGES.invalidSecret);
  });
});
