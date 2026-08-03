import type { CaptureState, SerpCapture } from "../shared/types";
import { DEFAULT_REDACTOR_ENDPOINT, sendCaptureToRedactor } from "../shared/redactor-client";
import { PAIRING_SECRET_KEY } from "../shared/pairing";

export const JOB_POLL_ALARM_NAME = "redactor-seo-job-poll";
export const JOB_POLL_PERIOD_MINUTES = 1;
export const DEFAULT_REDACTOR_JOB_ENDPOINT = new URL("/job", DEFAULT_REDACTOR_ENDPOINT).toString();

export interface RedactorJob {
  keywords: string[];
  requestedResultCount: number;
}

export interface JobPollingDependencies {
  getPairingSecret: () => Promise<string | null>;
  getCaptureState: () => Promise<CaptureState>;
  runCapture: (keywords: string[], requestedResultCount: number) => Promise<SerpCapture | null>;
  sendCapture?: (capture: SerpCapture, secret: string) => Promise<void>;
  fetchJob?: (secret: string) => Promise<RedactorJob | null>;
}

export function scheduleJobPolling(alarms: typeof chrome.alarms = chrome.alarms): void {
  // Chrome MV3 service workers can sleep; alarms are the durable periodic trigger.
  // Normal extensions have a practical minimum period of about one minute.
  alarms.create(JOB_POLL_ALARM_NAME, { periodInMinutes: JOB_POLL_PERIOD_MINUTES });
}

export async function readPairingSecretFromStorage(storageArea: typeof chrome.storage.local = chrome.storage.local): Promise<string | null> {
  const stored = await storageArea.get(PAIRING_SECRET_KEY);
  const secret = stored[PAIRING_SECRET_KEY];
  return typeof secret === "string" && secret.trim() ? secret : null;
}

export async function pollForRedactorJob(dependencies: JobPollingDependencies): Promise<void> {
  const secret = (await dependencies.getPairingSecret())?.trim();
  if (!secret) {
    return;
  }

  const fetchJob = dependencies.fetchJob ?? fetchPendingRedactorJob;
  const job = await fetchJob(secret);
  if (!job) {
    return;
  }

  const currentState = await dependencies.getCaptureState();
  if (currentState.status === "running") {
    return;
  }

  const capture = await dependencies.runCapture(job.keywords, job.requestedResultCount);
  if (!capture) {
    return;
  }

  try {
    const sendCapture = dependencies.sendCapture ?? sendCaptureToRedactor;
    await sendCapture(capture, secret);
  } catch {
    // Leave retry timing to the next alarm; the CLI keeps the job pending until POST /serp succeeds.
  }
}

export async function fetchPendingRedactorJob(secret: string, endpoint = DEFAULT_REDACTOR_JOB_ENDPOINT): Promise<RedactorJob | null> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret.trim()}`
      }
    });
  } catch {
    return null;
  }

  if (response.status === 204) {
    return null;
  }

  if (response.status !== 200) {
    return null;
  }

  const payload: unknown = await response.json().catch(() => null);
  return isRedactorJob(payload) ? payload : null;
}

function isRedactorJob(value: unknown): value is RedactorJob {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RedactorJob>;
  return (
    Array.isArray(candidate.keywords) &&
    candidate.keywords.length > 0 &&
    candidate.keywords.every((keyword) => typeof keyword === "string" && keyword.trim().length > 0) &&
    Number.isInteger(candidate.requestedResultCount) &&
    typeof candidate.requestedResultCount === "number" &&
    candidate.requestedResultCount > 0
  );
}
