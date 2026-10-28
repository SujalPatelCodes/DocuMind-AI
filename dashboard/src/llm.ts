import type { ModelId } from "./types";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

/**
 * Ollama chat-API endpoint bases, tried in order. In dev the first one hits
 * Vite's `/ollama` proxy (no CORS). In production the proxy does not exist,
 * so we fall through to Ollama's own port — which must be started with
 * `OLLAMA_ORIGINS="*"` (or the app's origin) for the browser to reach it.
 *
 * The model itself is llama3.2:3b, pulled into Ollama and referenced through
 * the active `ModelId`.
 */
const ENDPOINT_BASES = ["/ollama", "http://localhost:11434"];

const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Ask llama3.2:3b a chat completion via the local Ollama server.
 * Throws if Ollama is unreachable or the model tag is missing — callers
 * fall back to the built-in retrieval engine, so the app keeps working.
 */
export async function chatWithModel(
  model: ModelId,
  messages: LLMMessage[],
): Promise<string> {
  let lastError: unknown = null;

  for (const base of ENDPOINT_BASES) {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.images && m.images.length ? { images: m.images } : {}),
          })),
          stream: false,
          think: false,
          options: {
            temperature: 0.1,
            num_predict: 2000,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Ollama (${base}) returned HTTP ${response.status}`);
      }
      const data = await response.json();
      const content =
        typeof data?.message?.content === "string"
          ? data.message.content.trim()
          : "";
      if (content) return content;
      throw new Error(`Ollama (${base}) returned an empty reply`);
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Ollama is not reachable — is it running?");
}