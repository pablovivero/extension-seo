import type { BackgroundRequest, BackgroundResponse, CaptureState, ExtractResponse, SerpCapture, SerpQuery } from "../shared/types";
import { JOB_POLL_ALARM_NAME, pollForRedactorJob, readPairingSecretFromStorage, scheduleJobPolling } from "./job-polling";
import { sendCaptureToRedactor } from "../shared/redactor-client";
import { PAIRING_SECRET_KEY } from "../shared/pairing";
import { buildGoogleSearchUrl, toSafeTimestampForFilename } from "../shared/validation";

const LOCALE = "es-ES";
const PAGE_READY_TIMEOUT_MS = 15000;
const AFTER_LOAD_DELAY_MS = 2500;
const BETWEEN_SEARCH_DELAY_MS = 1500;
const SESSION_STATE_KEY = "captureState";

let state: CaptureState = createIdleState();
let activeTabId: number | null = null;

chrome.runtime.onInstalled.addListener(() => {
  scheduleJobPolling();
  void persistState();
  void checkForRedactorJob();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreState();
  scheduleJobPolling();
  void checkForRedactorJob();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === JOB_POLL_ALARM_NAME) {
    void checkForRedactorJob();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  const newSecret = changes[PAIRING_SECRET_KEY]?.newValue;
  if (areaName === "local" && typeof newSecret === "string" && newSecret.trim()) {
    void checkForRedactorJob();
  }
});

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse: (response: BackgroundResponse) => void) => {
  void handleMessage(request)
    .then(sendResponse)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Error desconocido.";
      state = { ...state, status: "error", lastError: message };
      void persistState();
      sendResponse({ ok: false, error: message, state });
    });

  return true;
});

async function handleMessage(request: BackgroundRequest): Promise<BackgroundResponse> {
  await restoreState();

  switch (request.type) {
    case "START_CAPTURE":
      if (state.status === "running") {
        return { ok: false, error: "Ya hay una captura en curso.", state };
      }
      void runCapture(request.payload.keywords, request.payload.requestedResultCount);
      return { ok: true, state };
    case "CANCEL_CAPTURE":
      state = { ...state, cancelRequested: true, lastError: null };
      await persistState();
      return { ok: true, state };
    case "GET_STATE":
      return { ok: true, state };
    case "DOWNLOAD_LAST_RESULT":
      if (!state.capture) {
        return { ok: false, error: "No hay un resultado disponible para descargar.", state };
      }
      await downloadCapture(state.capture);
      return { ok: true, state };
    case "SEND_LAST_RESULT_TO_REDACTOR":
      if (!state.capture) {
        return { ok: false, error: "No hay un resultado disponible para enviar.", state };
      }
      try {
        await sendCaptureToRedactor(state.capture, request.payload.secret);
        return { ok: true, state };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "No se pudo enviar la captura al redactor. Vuelve a intentarlo.";
        return { ok: false, error: message, state };
      }
  }
}

async function checkForRedactorJob(): Promise<void> {
  await pollForRedactorJob({
    getPairingSecret: readPairingSecret,
    getCaptureState: async () => {
      await restoreState();
      return state;
    },
    runCapture,
    sendCapture: sendCaptureToRedactor
  });
}

async function readPairingSecret(): Promise<string | null> {
  return readPairingSecretFromStorage();
}

async function runCapture(keywords: string[], requestedResultCount: number): Promise<SerpCapture | null> {
  const capturedAt = new Date().toISOString();
  state = {
    status: "running",
    keywords,
    requestedResultCount,
    currentIndex: 0,
    currentKeyword: null,
    capture: {
      schemaVersion: "1.0",
      capturedAt,
      engine: "google",
      locale: LOCALE,
      queries: []
    },
    lastError: null,
    warnings: [],
    downloadFilename: null,
    canDownloadAgain: false,
    cancelRequested: false
  };
  await persistState();

  try {
    activeTabId = await createOrReuseTab();

    for (let index = 0; index < keywords.length; index += 1) {
      await restoreState();
      if (state.cancelRequested) {
        state = { ...state, status: "cancelled", currentKeyword: null };
        await persistState();
        await closeActiveTab();
        break;
      }

      const keyword = keywords[index];
      state = { ...state, currentIndex: index, currentKeyword: keyword, lastError: null };
      await persistState();

      const query = await captureKeyword(keyword, requestedResultCount);
      state = {
        ...state,
        capture: appendQuery(state.capture, query),
        warnings: [...state.warnings, ...query.warnings.map((warning) => `${keyword}: ${warning}`)]
      };
      await persistState();

      if (index < keywords.length - 1) {
        await delay(BETWEEN_SEARCH_DELAY_MS);
      }
    }

    if (state.status === "running") {
      state = { ...state, status: "completed", currentKeyword: null, currentIndex: keywords.length };
      await persistState();
      if (state.capture) {
        await downloadCapture(state.capture);
      }
      await closeActiveTab();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido durante la captura.";
    state = { ...state, status: "error", lastError: message, currentKeyword: null };
    await persistState();
  } finally {
    await closeActiveTab();
  }

  return state.status === "completed" ? state.capture : null;
}

async function captureKeyword(keyword: string, requestedResultCount: number): Promise<SerpQuery> {
  const searchUrl = buildGoogleSearchUrl(keyword, requestedResultCount);
  const capturedAt = new Date().toISOString();
  const warnings: string[] = [];

  if (activeTabId === null) {
    activeTabId = await createOrReuseTab();
  }

  try {
    await updateTab(activeTabId, searchUrl);
    await waitForTabComplete(activeTabId, PAGE_READY_TIMEOUT_MS);
    await delay(AFTER_LOAD_DELAY_MS);
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["assets/extract-serp.js"]
    });

    const response = await sendExtractRequest(activeTabId, requestedResultCount);
    return {
      keyword,
      searchUrl,
      capturedAt,
      requestedResultCount,
      results: response.results,
      warnings: response.warnings
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "No se pudo capturar esta keyword.";
    warnings.push(message);
    return {
      keyword,
      searchUrl,
      capturedAt,
      requestedResultCount,
      results: [],
      warnings
    };
  }
}

async function createOrReuseTab(): Promise<number> {
  const tab = await chrome.tabs.create({ url: "about:blank", active: true });
  if (tab.id === undefined) {
    throw new Error("Chrome no devolvio un id para la pestana temporal.");
  }
  return tab.id;
}

async function updateTab(tabId: number, url: string): Promise<void> {
  await chrome.tabs.update(tabId, { url, active: true });
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tiempo de espera agotado al cargar la pagina de Google."));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo): void => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        globalThis.clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function sendExtractRequest(tabId: number, requestedResultCount: number): Promise<ExtractResponse> {
  const response: unknown = await chrome.tabs.sendMessage(tabId, { requestedResultCount });
  if (!isExtractResponse(response)) {
    throw new Error("El content script no devolvio una respuesta valida.");
  }
  return response;
}

function isExtractResponse(value: unknown): value is ExtractResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ExtractResponse>;
  return Array.isArray(candidate.results) && Array.isArray(candidate.warnings);
}

async function downloadCapture(capture: SerpCapture): Promise<void> {
  const json = JSON.stringify(capture, null, 2);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const filename = `serp-results-${toSafeTimestampForFilename(capture.capturedAt)}.json`;

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: "uniquify"
  });

  state = { ...state, downloadFilename: filename, canDownloadAgain: true };
  await persistState();
}

async function closeActiveTab(): Promise<void> {
  if (activeTabId === null) {
    return;
  }

  try {
    await chrome.tabs.remove(activeTabId);
  } catch {
    // The user may have closed the temporary tab manually.
  } finally {
    activeTabId = null;
  }
}

function appendQuery(capture: SerpCapture | null, query: SerpQuery): SerpCapture {
  if (!capture) {
    return {
      schemaVersion: "1.0",
      capturedAt: new Date().toISOString(),
      engine: "google",
      locale: LOCALE,
      queries: [query]
    };
  }

  return {
    ...capture,
    queries: [...capture.queries, query]
  };
}

async function restoreState(): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION_STATE_KEY);
  const storedState = stored[SESSION_STATE_KEY] as CaptureState | undefined;
  if (storedState) {
    state = storedState;
  }
}

async function persistState(): Promise<void> {
  await chrome.storage.session.set({ [SESSION_STATE_KEY]: state });
}

function createIdleState(): CaptureState {
  return {
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
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
