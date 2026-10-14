/**
 * Client for the local DocuMind API (see ../server/apiPlugin.mjs).
 *
 * Every mutation is mirrored to SQLite so the workspace survives a refresh.
 * Calls are optimistic: the UI updates immediately and persistence happens in
 * the background — a failed write is logged, never blocking the chat.
 */
import type { ChatMessage, Conversation, ModelId } from "./types";

export interface AppSettings {
  model: ModelId;
  activeConvId: string | null;
}

/** Metadata for a conversation's saved document (bytes are fetched on demand). */
export interface DocumentMeta {
  name: string;
  numPages: number;
}

export interface AppState {
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  documents: Record<string, DocumentMeta>;
  settings: AppSettings;
}

export interface SavedDocument {
  name: string;
  bytes: Uint8Array;
}

const BASE = "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  getState: () => request<AppState>("GET", "/state"),

  createConversation: (conversation: Conversation) =>
    request<{ ok: true }>("POST", "/conversations", conversation),

  renameConversation: (id: string, title: string) =>
    request<{ ok: true }>("PATCH", `/conversations/${encodeURIComponent(id)}`, {
      title,
    }),

  deleteConversation: (id: string) =>
    request<{ ok: true }>("DELETE", `/conversations/${encodeURIComponent(id)}`),

  addMessage: (convId: string, message: ChatMessage) =>
    request<{ ok: true }>(
      "POST",
      `/conversations/${encodeURIComponent(convId)}/messages`,
      message,
    ),

  patchMessage: (convId: string, id: string, text: string) =>
    request<{ ok: true }>(
      "PATCH",
      `/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(id)}`,
      { text },
    ),

  /** Save (or replace) the conversation's PDF — raw binary body, metadata via query. */
  saveDocument: async (
    convId: string,
    name: string,
    numPages: number,
    bytes: Uint8Array,
  ): Promise<void> => {
    const query = new URLSearchParams({ name, numPages: String(numPages) });
    const res = await fetch(
      `${BASE}/conversations/${encodeURIComponent(convId)}/document?${query}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: bytes,
      },
    );
    if (!res.ok) {
      throw new Error(`PUT document failed (${res.status})`);
    }
  },

  /** Fetch the conversation's saved PDF, or null when it has none. */
  getDocument: async (convId: string): Promise<SavedDocument | null> => {
    const res = await fetch(
      `${BASE}/conversations/${encodeURIComponent(convId)}/document`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET document failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const rawName = res.headers.get("X-Document-Name");
    return { name: rawName ? decodeURIComponent(rawName) : "document.pdf", bytes };
  },

  deleteDocument: (convId: string) =>
    request<{ ok: true }>(
      "DELETE",
      `/conversations/${encodeURIComponent(convId)}/document`,
    ),

  saveSettings: (patch: Partial<AppSettings>) =>
    request<{ ok: true }>("PUT", "/settings", patch),
};

/** Fire-and-forget persistence: log failures instead of crashing the UI. */
export function persist(promise: Promise<unknown>): void {
  promise.catch((error) => {
    console.warn("[documind] failed to persist change:", error);
  });
}
