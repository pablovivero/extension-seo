import type { SerpCapture } from "./types";

export const DEFAULT_REDACTOR_ENDPOINT = "http://127.0.0.1:43187/serp";

export const REDACTOR_MESSAGES = {
  missingSecret: "Primero empareja la extensión con el redactor (pega el código que te dio el CLI).",
  connectionRefused: "El redactor no está esperando ahora mismo. Ejecuta 'npm run generar' y vuelve a intentarlo.",
  invalidSecret: "El emparejamiento no es válido. Vuelve a pegar el código desde el CLI.",
  success: "Enviado. El redactor ya está trabajando con esta captura."
} as const;

export async function sendCaptureToRedactor(capture: SerpCapture, secret: string, endpoint = DEFAULT_REDACTOR_ENDPOINT): Promise<void> {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error(REDACTOR_MESSAGES.missingSecret);
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
    throw new Error(REDACTOR_MESSAGES.connectionRefused);
  }

  if (response.status === 204) {
    return;
  }

  if (response.status === 401) {
    throw new Error(REDACTOR_MESSAGES.invalidSecret);
  }

  throw new Error("No se pudo enviar la captura al redactor. Vuelve a intentarlo.");
}
