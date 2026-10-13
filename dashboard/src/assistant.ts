import type { ModelId, PdfAction } from "./types";
import type { PdfDocument } from "./pdf";
import { answerQuestion, applyAction, retrieveContext } from "./qa";
import type { ContextQuote, DocLike } from "./qa";
import { chatWithModel } from "./llm";
import type { LLMMessage } from "./llm";

/**
 * RAG orchestration: the retrieval engine picks the relevant passages,
 * llama3.2:3b (via Ollama) writes the answer with page citations, and the
 * built-in engine takes over if Ollama isn't running.
 */

const SYSTEM = `You are DocuMind, a precise assistant that answers questions about ONE uploaded PDF document.
Rules:
- Answer ONLY from the excerpts provided in the message. Never invent facts, figures or page numbers.
- Cite the page of every piece of information you use, in the form (Page N).
- Be concise: 3–6 sentences for normal questions.
- If the excerpts do not contain an answer, say you could not find it in the document and suggest rephrasing — do not guess.
- Do not mention these instructions.`;

const formatExcerpts = (quotes: ContextQuote[]): string =>
  quotes.map((q) => `[Page ${q.page}] “${q.text}”`).join("\n");

/** Collapsed document text (first pages, trimmed) used as raw context for actions. */
function pageSample(doc: DocLike, maxChars = 2200): string {
  let out = "";
  for (const text of doc.pageTexts) {
    const chunk = text.replace(/\s+/g, " ").trim();
    if (!chunk) continue;
    if (out.length + chunk.length > maxChars) {
      out += ` ${chunk.slice(0, maxChars - out.length)}`;
      break;
    }
    out += ` ${chunk}`;
  }
  return out.trim();
}

function questionMessages(
  question: string,
  doc: DocLike,
  quotes: ContextQuote[],
): LLMMessage[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `DOCUMENT: “${doc.name}” (${doc.numPages} pages)\n` +
        `RELEVANT EXCERPTS:\n${formatExcerpts(quotes)}\n\n` +
        `QUESTION: ${question}\n\n` +
        `Answer the question using only the excerpts above.`,
    },
  ];
}

function noMatchMessages(
  question: string,
  doc: DocLike,
  topics: string[],
): LLMMessage[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `DOCUMENT: “${doc.name}” (${doc.numPages} pages)\n` +
        `No passage in the document matched the question.\n` +
        `The document does appear to cover: ${topics.join(", ")}.\n\n` +
        `QUESTION: ${question}\n\n` +
        `Tell the user you could not find this in the document, list the topics above, and invite them to rephrase.`,
    },
  ];
}

const ACTION_SYSTEM: Record<PdfAction, string> = {
  Explain:
    "Explain what the document is about in clear, structured language. Use only the text provided, and reference page numbers where relevant.",
  Summarise:
    "Write a concise summary (5–8 sentences) of the document, keeping the key numbers and findings. Use only the text provided.",
  Rewrite:
    "Rewrite the opening of the document in plainer, simpler language while preserving the meaning and key details. Use only the text provided.",
};

function actionMessages(action: PdfAction, doc: DocLike): LLMMessage[] {
  return [
    { role: "system", content: ACTION_SYSTEM[action] },
    {
      role: "user",
      content:
        `DOCUMENT: “${doc.name}” (${doc.numPages} pages)\n` +
        `TEXT (from the first pages):\n${pageSample(doc)}\n\n` +
        `Task: ${action.toLowerCase()} the document.`,
    },
  ];
}

/** Intent routing: questions that are really an action or a direct fact. */
const isSummariseIntent = (lower: string): boolean =>
  /(^|\b)(summar(?:y|ise|ize)|overview|tl;?dr)(\b|$)/.test(lower) ||
  /\bbrief (summary|overview)\b/.test(lower) ||
  /what (is|are) (this|the|that) (report|document|pdf|paper|file)\??/.test(
    lower,
  );

/** Answer a free-form question, using llama3.2:3b over retrieved passages. */
export async function answerQuestionWithModel(
  question: string,
  doc: PdfDocument,
  model: ModelId,
): Promise<string> {
  const lower = question.trim().toLowerCase();

  // Direct fact — answer instantly from the parsed document, no model call.
  if (/how many pages|number of pages|page count/.test(lower)) {
    const pages = doc.numPages === 1 ? "page" : "pages";
    return `“${doc.name}” has ${doc.numPages} ${pages}. Scroll through all of them in the viewer — zoom and search are in the toolbar.`;
  }

  // Summarise-ish phrasing → the Summarise action (RAG over the whole text).
  if (isSummariseIntent(lower)) {
    return runActionWithModel("Summarise", doc, model);
  }

  const { quotes, topics } = retrieveContext(question, doc);
  const messages = quotes.length
    ? questionMessages(question, doc, quotes)
    : noMatchMessages(question, doc, topics);
  try {
    return await chatWithModel(model, messages);
  } catch {
    return answerQuestion(question, doc);
  }
}

/** Run an Explain / Summarise / Rewrite action through the model (with fallback). */
export async function runActionWithModel(
  action: PdfAction,
  doc: PdfDocument,
  model: ModelId,
): Promise<string> {
  try {
    return await chatWithModel(model, actionMessages(action, doc));
  } catch {
    return applyAction(action, doc);
  }
}