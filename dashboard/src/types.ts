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

/** The only model this project runs: llama.cpp / Ollama's llama3.2:3b. */
export type ModelId = "llama3.2:3b";

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