export interface SerpCapture {
  schemaVersion: "1.0";
  capturedAt: string;
  engine: "google";
  locale: string;
  queries: SerpQuery[];
}

export interface SerpQuery {
  keyword: string;
  searchUrl: string;
  capturedAt: string;
  requestedResultCount: number;
  results: SerpResult[];
  warnings: string[];
}

export interface SerpResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string | null;
  type: "organic";
}

export interface CaptureOptions {
  keywords: string[];
  requestedResultCount: number;
}

export interface CaptureState {
  status: "idle" | "running" | "completed" | "cancelled" | "error";
  keywords: string[];
  requestedResultCount: number;
  currentIndex: number;
  currentKeyword: string | null;
  capture: SerpCapture | null;
  lastError: string | null;
  warnings: string[];
  downloadFilename: string | null;
  canDownloadAgain: boolean;
  cancelRequested: boolean;
}

export interface ExtractRequest {
  requestedResultCount: number;
}

export interface ExtractResponse {
  results: SerpResult[];
  warnings: string[];
}

export type BackgroundRequest =
  | { type: "START_CAPTURE"; payload: CaptureOptions }
  | { type: "CANCEL_CAPTURE" }
  | { type: "GET_STATE" }
  | { type: "DOWNLOAD_LAST_RESULT" }
  | { type: "SEND_LAST_RESULT_TO_REDACTOR"; payload: { secret: string } };

export interface BackgroundResponse {
  ok: boolean;
  state?: CaptureState;
  error?: string;
}
