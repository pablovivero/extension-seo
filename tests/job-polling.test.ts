import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REDACTOR_JOB_ENDPOINT,
  JOB_POLL_ALARM_NAME,
  JOB_POLL_PERIOD_MINUTES,
  pollForRedactorJob,
  readPairingSecretFromStorage,
  scheduleJobPolling
} from "../src/background/job-polling";
import type { CaptureState, SerpCapture } from "../src/shared/types";

const idleState: CaptureState = {
  status: "idle",
  keywords: [],
  requestedResultCount: 5,
  currentIndex: 0,
  currentKeyword: null,
  capture: null,
  lastError: null,
  warnings: [],
  downloadFilename: null,
  canDownloadAgain: false,
  cancelRequested: false
};

const capture: SerpCapture = {
  schemaVersion: "1.0",
  capturedAt: "2026-08-03T10:00:00.000Z",
  engine: "google",
  locale: "es-ES",
  queries: []
};

describe("job polling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("programa la alarma periodica minima practica", () => {
    const alarms = {
      create: vi.fn()
    } as unknown as typeof chrome.alarms;

    scheduleJobPolling(alarms);

    expect(alarms.create).toHaveBeenCalledWith(JOB_POLL_ALARM_NAME, { periodInMinutes: JOB_POLL_PERIOD_MINUTES });
  });

  it("sin secreto guardado no consulta jobs ni captura", async () => {
    const storageArea = {
      get: vi.fn().mockResolvedValue({})
    } as unknown as typeof chrome.storage.local;
    const fetchJob = vi.fn();
    const runCapture = vi.fn();

    await pollForRedactorJob({
      getPairingSecret: () => readPairingSecretFromStorage(storageArea),
      getCaptureState: async () => idleState,
      runCapture,
      fetchJob
    });

    expect(storageArea.get).toHaveBeenCalledWith("redactorPairingSecret");
    expect(fetchJob).not.toHaveBeenCalled();
    expect(runCapture).not.toHaveBeenCalled();
  });

  it("con 204 no hace nada", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const runCapture = vi.fn();

    await pollForRedactorJob({
      getPairingSecret: async () => "secret",
      getCaptureState: async () => idleState,
      runCapture
    });

    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_REDACTOR_JOB_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: "Bearer secret"
      }
    });
    expect(runCapture).not.toHaveBeenCalled();
  });

  it("si ya hay una captura en curso no arranca otra", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        keywords: ["job pendiente"],
        requestedResultCount: 5
      })
    );
    const runCapture = vi.fn();

    await pollForRedactorJob({
      getPairingSecret: async () => "secret",
      getCaptureState: async () => ({ ...idleState, status: "running" }),
      runCapture
    });

    expect(runCapture).not.toHaveBeenCalled();
  });

  it("con 200 y job captura y envia automaticamente", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        keywords: ["impresoras etiquetas", "ribbon cera"],
        requestedResultCount: 5
      })
    );
    const runCapture = vi.fn().mockResolvedValue(capture);
    const sendCapture = vi.fn().mockResolvedValue(undefined);

    await pollForRedactorJob({
      getPairingSecret: async () => " secret ",
      getCaptureState: async () => idleState,
      runCapture,
      sendCapture
    });

    expect(runCapture).toHaveBeenCalledWith(["impresoras etiquetas", "ribbon cera"], 5);
    expect(sendCapture).toHaveBeenCalledWith(capture, "secret");
  });

  it("si falla el envio no rompe el ciclo siguiente", async () => {
    const fetchJob = vi
      .fn()
      .mockResolvedValueOnce({ keywords: ["primer job"], requestedResultCount: 3 })
      .mockResolvedValueOnce({ keywords: ["segundo job"], requestedResultCount: 4 });
    const runCapture = vi.fn().mockResolvedValue(capture);
    const sendCapture = vi.fn().mockRejectedValueOnce(new Error("conexion rechazada")).mockResolvedValueOnce(undefined);
    const dependencies = {
      getPairingSecret: async () => "secret",
      getCaptureState: async () => idleState,
      runCapture,
      sendCapture,
      fetchJob
    };

    await expect(pollForRedactorJob(dependencies)).resolves.toBeUndefined();
    await expect(pollForRedactorJob(dependencies)).resolves.toBeUndefined();

    expect(runCapture).toHaveBeenNthCalledWith(1, ["primer job"], 3);
    expect(runCapture).toHaveBeenNthCalledWith(2, ["segundo job"], 4);
    expect(sendCapture).toHaveBeenCalledTimes(2);
  });
});
