import type { BackgroundRequest, BackgroundResponse, CaptureState } from "../shared/types";
import { DEFAULT_RESULT_COUNT, MAX_RESULT_COUNT, validateCaptureInput } from "../shared/validation";

const keywordsInput = getElement<HTMLTextAreaElement>("keywords");
const resultCountInput = getElement<HTMLInputElement>("resultCount");
const startButton = getElement<HTMLButtonElement>("startButton");
const cancelButton = getElement<HTMLButtonElement>("cancelButton");
const statusText = getElement<HTMLSpanElement>("statusText");
const currentKeyword = getElement<HTMLSpanElement>("currentKeyword");
const progressText = getElement<HTMLSpanElement>("progressText");
const messages = getElement<HTMLDivElement>("messages");
const summary = getElement<HTMLElement>("summary");
const summaryText = getElement<HTMLParagraphElement>("summaryText");
const downloadAgainButton = getElement<HTMLButtonElement>("downloadAgainButton");

let pollTimer: number | null = null;

resultCountInput.value = String(DEFAULT_RESULT_COUNT);
resultCountInput.max = String(MAX_RESULT_COUNT);

startButton.addEventListener("click", () => {
  void startCapture();
});

cancelButton.addEventListener("click", () => {
  void sendRequest({ type: "CANCEL_CAPTURE" }).then((response) => {
    renderResponse(response);
  });
});

downloadAgainButton.addEventListener("click", () => {
  void sendRequest({ type: "DOWNLOAD_LAST_RESULT" }).then((response) => {
    renderResponse(response);
  });
});

void refreshState();

async function startCapture(): Promise<void> {
  clearMessages();
  const validation = validateCaptureInput(keywordsInput.value, resultCountInput.value);

  if (!validation.ok || !validation.options) {
    renderMessages(validation.errors, "error");
    return;
  }

  const response = await sendRequest({ type: "START_CAPTURE", payload: validation.options });
  renderResponse(response);
  startPolling();
}

async function refreshState(): Promise<void> {
  const response = await sendRequest({ type: "GET_STATE" });
  renderResponse(response);

  if (response.state?.status === "running") {
    startPolling();
  }
}

function startPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
  }

  pollTimer = window.setInterval(() => {
    void refreshState();
  }, 1000);
}

function stopPollingIfFinished(state: CaptureState): void {
  if (state.status === "running" || pollTimer === null) {
    return;
  }

  window.clearInterval(pollTimer);
  pollTimer = null;
}

function renderResponse(response: BackgroundResponse): void {
  if (!response.ok && response.error) {
    renderMessages([response.error], "error");
  }

  if (response.state) {
    renderState(response.state);
  }
}

function renderState(state: CaptureState): void {
  statusText.textContent = getStatusLabel(state.status);
  currentKeyword.textContent = state.currentKeyword ?? "-";
  progressText.textContent = `${Math.min(state.currentIndex + (state.status === "completed" ? 0 : 1), state.keywords.length)} de ${state.keywords.length}`;

  const running = state.status === "running";
  startButton.disabled = running;
  cancelButton.hidden = !running;

  clearMessages();
  if (state.lastError) {
    renderMessages([state.lastError], "error");
  }
  if (state.warnings.length > 0) {
    renderMessages(state.warnings.slice(-5), "warning");
  }

  const completedQueries = state.capture?.queries.length ?? 0;
  const totalResults = state.capture?.queries.reduce((sum, query) => sum + query.results.length, 0) ?? 0;
  summary.hidden = state.status === "idle" || state.status === "running";
  summaryText.textContent = `${completedQueries} keywords procesadas, ${totalResults} resultados capturados.`;
  downloadAgainButton.hidden = !state.canDownloadAgain;
  stopPollingIfFinished(state);
}

function getStatusLabel(status: CaptureState["status"]): string {
  switch (status) {
    case "idle":
      return "Inactivo";
    case "running":
      return "Capturando";
    case "completed":
      return "Completado";
    case "cancelled":
      return "Cancelado";
    case "error":
      return "Error";
  }
}

function renderMessages(items: string[], type: "error" | "warning"): void {
  for (const item of items) {
    const element = document.createElement("p");
    element.className = `message ${type}`;
    element.textContent = item;
    messages.append(element);
  }
}

function clearMessages(): void {
  messages.replaceChildren();
}

async function sendRequest(request: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage<BackgroundRequest, BackgroundResponse>(request);
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Falta el elemento #${id}.`);
  }
  return element as T;
}
