import { DEFAULT_CAPTURE_ENDPOINT, LOCAL_API_MESSAGES, sendCaptureToLocalApi } from "./local-api-client";
import type { SerpCapture } from "./types";

export const DEFAULT_REDACTOR_ENDPOINT = DEFAULT_CAPTURE_ENDPOINT;
export const REDACTOR_MESSAGES = LOCAL_API_MESSAGES;

export function sendCaptureToRedactor(capture: SerpCapture, secret: string, endpoint = DEFAULT_REDACTOR_ENDPOINT): Promise<void> {
  return sendCaptureToLocalApi(capture, secret, endpoint);
}
