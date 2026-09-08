import type { SerpCapture } from "./types";

const DEFAULT_LOCAL_API_ORIGIN = "http://127.0.0.1:43187";
const LOCAL_API_ORIGIN = import.meta.env.VITE_LOCAL_CAPTURE_ENDPOINT ?? DEFAULT_LOCAL_API_ORIGIN;

export const DEFAULT_LOCAL_API_BASE_URL = normalizeBaseUrl(LOCAL_API_ORIGIN);
export const DEFAULT_CAPTURE_ENDPOINT = new URL("/serp", DEFAULT_LOCAL_API_BASE_URL).toString();
export const DEFAULT_JOB_ENDPOINT = new URL("/job", DEFAULT_LOCAL_API_BASE_URL).toString();

export const LOCAL_API_MESSAGES = {
  missingSecret: "First pair the extension with your local receiver by pasting its pairing code.",
  connectionRefused: "The local receiver is not available right now. Start it and try again.",
  invalidSecret: "The pairing code is not valid. Pair the extension again.",
  success: "Sent. The local receiver accepted this capture."
} as const;

export async function sendCaptureToLocalApi(capture: SerpCapture, secret: string, endpoint = DEFAULT_CAPTURE_ENDPOINT): Promise<void> {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error(LOCAL_API_MESSAGES.missingSecret);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalizedSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(capture)
    });
  } catch {
    throw new Error(LOCAL_API_MESSAGES.connectionRefused);
  }

  if (response.status === 204) {
    return;
  }

  if (response.status === 401) {
    throw new Error(LOCAL_API_MESSAGES.invalidSecret);
  }

  throw new Error("The capture could not be sent to the local receiver. Try again.");
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}
