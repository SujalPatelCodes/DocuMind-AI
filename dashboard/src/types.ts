export interface Conversation {
  id: string;
  title: string;
  group: "TODAY" | "YESTERDAY";
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  time: string;
}

/** The models available in this project (Ollama). */
export type ModelId = "llama3.2:3b" | "qwen3.5:9b" | "qwen2.5vl:3b";

export type NavKey =
  | "docs"
  | "code"
  | "upload"
  | "tools"
  | "help"
  | "settings"
  | "profile"
  | "logout";

export type PdfAction = "Explain" | "Summarise" | "Rewrite";