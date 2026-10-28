import type { PdfAction } from "./types";
import type { PdfDocument } from "./pdf";

/** The subset of a loaded document the QA engine actually needs. */
export type DocLike = Pick<PdfDocument, "name" | "numPages" | "pageTexts">;

/* ------------------------------------------------------------------ */
/*  Text helpers                                                       */
/* ------------------------------------------------------------------ */

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "am", "this", "that",
  "these", "those", "it", "its", "as", "at", "by", "from", "about", "into",
  "onto", "over", "under", "between", "among", "can", "could", "should",
  "would", "will", "shall", "may", "might", "must", "do", "does", "did",
  "done", "has", "have", "had", "having", "how", "what", "which", "who",
  "whom", "whose", "why", "when", "where", "i", "you", "we", "they", "he",
  "she", "me", "my", "our", "your", "their", "him", "her", "us", "not", "no",
  "yes", "if", "then", "than", "so", "such", "there", "here", "please",
  "tell", "more", "much", "many", "some", "any", "all", "each", "both",
  "also", "just", "very", "per", "etc", "via", "pdf", "page", "pages",
  "report", "document", "doc", "ask", "like", "say", "says", "said",
  "actually", "really", "show", "know", "want", "need", "get", "got", "give",
  "find", "looking", "talk", "discuss", "explain", "summarize", "summarise",
  "summary", "rewrite", "make", "out", "up", "down", "off", "way", "thing",
  "things", "one", "two", "three", "around", "across", "along", "without",
  "within", "through", "during", "since", "until", "while", "because",
  "though", "although", "whether", "unless", "whereas", "therefore",
  "however", "moreover", "furthermore", "too", "still", "already", "yet",
  "ever", "never", "always", "usually", "often", "sometimes", "every",
  "everyone", "everything", "something", "anything", "nothing", "someone",
  "against", "behind", "before", "after", "above", "below", "beneath",
  "beside", "beyond", "inside", "outside", "near", "next", "upon", "toward",
  "towards", "whole", "entire", "full", "main", "key", "major", "minor",
  "other", "another", "others", "same", "few", "several", "lot", "lots",
  "number", "amount", "level", "rate", "data", "model", "study", "analysis",
  "results", "result", "section", "chapter", "title", "heading", "first",
  "second", "third", "next", "last", "previous", "current", "following",
  "note", "notes", "see", "look", "reader", "read", "reading", "understand",
  "clear", "clearly", "basically", "essentially", "probably", "perhaps",
  "maybe", "likely", "unlikely", "possible", "important", "interesting",
  "relevant", "related", "general", "specific",
]);

/** Light stemmer: panels→panel, batteries→battery, costs→cost, … */
const norm = (w: string): string => {
  if (w.length < 4) return w;
  if (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is")) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("es")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
};

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(norm);

const sentenceSplit = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** Keep entries that read like sentences, not headings/titles/labels. */
const isSentenceLike = (s: string): boolean =>
  /[.!?]["”')]?$/.test(s) || s.length >= 80;

const plural = (n: number) => (n === 1 ? "" : "s");

/** Every sentence-ish fragment of a page, split per line first so that
 *  heading/title lines stay separate from the paragraphs that follow. */
function sentencePool(page: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let offset = 0;
  for (const line of page.split("\n")) {
    for (const s of sentenceSplit(line)) {
      if (s.length >= 8) out.push({ text: s, start: offset });
    }
    offset += line.length + 1;
  }
  return out;
}

/** Real paragraphs only (used by the summary/explain/rewrite paths). */
function contentSentences(doc: DocLike, maxPages: number): string[] {
  const out: string[] = [];
  for (const page of doc.pageTexts.slice(0, maxPages)) {
    for (const line of page.split("\n")) {
      for (const s of sentenceSplit(line)) {
        if (s.length >= 12 && isSentenceLike(s)) out.push(s);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Retrieval scoring                                                  */
/* ------------------------------------------------------------------ */

function termTable(doc: DocLike) {
  const df = new Map<string, number>();
  const total = new Map<string, number>();
  for (const page of doc.pageTexts) {
    const seen = new Set<string>();
    for (const w of tokenize(page)) {
      if (STOP.has(w) || w.length < 2) continue;
      total.set(w, (total.get(w) ?? 0) + 1);
      if (!seen.has(w)) {
        seen.add(w);
        df.set(w, (df.get(w) ?? 0) + 1);
      }
    }
  }
  const N = Math.max(1, doc.numPages);
  const idf = (w: string): number => {
    if (w.length < 2) return 2.0;
    return Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
  };
  return { idf, total };
}

function queryTerms(q: string): { tokens: string[]; phrase: string } {
  return {
    tokens: tokenize(q),
    phrase: q.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim(),
  };
}

/** Rank whole pages against the query (BM25-lite with phrase bonus). */
function scorePage(
  text: string,
  tokens: string[],
  phrase: string,
  idf: (w: string) => number,
): number {
  const words = tokenize(text);
  if (words.length === 0) return -Infinity;
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const textLower = text.toLowerCase();

  let score = 0;
  let matched = 0;
  for (const w of tokens) {
    if (STOP.has(w) && w.length > 3) continue;
    if (w.length < 1) continue;
    const tf = counts.get(w) ?? 0;
    if (tf > 0) {
      matched++;
      score += tf * (idf(w) || 1.0);
    } else if (textLower.includes(w)) {
      matched++;
      score += 2.0;
    }
  }
  const hasPhrase = phrase.length > 1 && textLower.includes(phrase);
  if (hasPhrase) score += 12;
  if (matched === 0 && !hasPhrase) {
    if (text.trim().length > 20) return 0.5;
    return -0.1;
  }
  return score;
}

/** Score one sentence: query-token hits (idf-weighted), exact phrase and
 *  two-token co-occurrence bonuses. */
function scoreSentence(
  s: string,
  tokens: string[],
  phrase: string,
  idf: (w: string) => number,
): number {
  const words = new Set(tokenize(s));
  let sc = 0;
  for (const w of tokens) {
    if (STOP.has(w)) continue;
    if (w.length < 2) continue;
    if (words.has(w)) sc += idf(w) * 1.6;
  }
  const lower = s.toLowerCase();
  const content = tokens.filter((w) => !STOP.has(w) && w.length >= 2);
  if (phrase.length > 2 && lower.includes(phrase)) sc += 12;
  for (let i = 0; i + 1 < content.length; i++) {
    if (lower.includes(`${content[i]} ${content[i + 1]}`)) sc += 5;
  }
  if (sc === 0 && content.length > 0) {
    for (const w of content) {
      if (words.has(w)) { sc += 0.5; break; }
    }
  }
  return sc;
}

/** Pick the strongest sentences from a page; keep document order. */
function pickSentences(
  text: string,
  tokens: string[],
  phrase: string,
  idf: (w: string) => number,
  maxChars: number,
): string[] {
  const scored = sentencePool(text)
    .map(({ text: s, start }) => ({ s, start, sc: scoreSentence(s, tokens, phrase, idf) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc || b.s.length - a.s.length);

  const chosen: Array<{ s: string; start: number }> = [];
  let chars = 0;
  for (const c of scored) {
    if (chars + c.s.length > maxChars) continue;
    chosen.push(c);
    chars += c.s.length;
  }
  return chosen.sort((a, b) => a.start - b.start).map((c) => c.s);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function topTopics(doc: DocLike, limit = 4): string[] {
  const total = new Map<string, number>();
  for (const w of tokenize(doc.pageTexts.join(" "))) {
    if (STOP.has(w) || w.length < 4) continue;
    total.set(w, (total.get(w) ?? 0) + 1);
  }
  return [...total.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

export function suggestedTopic(doc: DocLike): string {
  return topTopics(doc, 1)[0] ?? "renewable energy";
}

export function answerQuestion(question: string, doc: DocLike): string {
  const q = question.trim();
  const lower = q.toLowerCase();
  const nameLabel = `“${doc.name}”`;

  if (doc.pageTexts.every((t) => !t.trim())) {
    return `${nameLabel} has no readable text — it looks like a scanned or image-only PDF. Try a text-based PDF, or ask me to work from another file.`;
  }

  if (/how many pages|number of pages|page count/.test(lower)) {
    return `${nameLabel} has ${doc.numPages} page${plural(doc.numPages)}. Scroll through all of them in the viewer, and use the zoom and search controls to navigate.`;
  }

  if (
    /(^|\b)(summar(?:y|ise|ize)|overview|tl;?dr)(\b|$)/.test(lower) ||
    /\bbrief (summary|overview)\b/.test(lower) ||
    /^what (is|are) .+(about|on)\??$/.test(lower)
  ) {
    return summarise(doc);
  }

  const { quotes, topics } = retrieveContext(q, doc);
  if (!quotes.length) {
    return `I couldn’t find anything in ${nameLabel} that answers “${q}”.\n\nTopics this document does cover: ${topics.join(
      ", ",
    )}. Try asking about one of those, or say “Summarise the report”.`;
  }

  const topic = q.replace(/\s+/g, " ").slice(0, 60);
  const bullets = quotes
    .map((c) => `• “${c.text}” — Page ${c.page}`)
    .join("\n");

  return `Here’s what ${nameLabel} says about “${topic}”:\n\n${bullets}\n\nWant me to go deeper into any of these points, or compare it with another part of the document?`;
}

/* ------------------------------------------------------------------ */
/*  Structured retrieval (feeds the RAG prompt for llama3.2:3b)        */
/* ------------------------------------------------------------------ */

export interface ContextQuote {
  /** 1-based page number the quote came from. */
  page: number;
  text: string;
}

export interface Retrieval {
  /** Best-matching sentences, in document order, with their page numbers. */
  quotes: ContextQuote[];
  /** Highest-frequency content words (used for the no-match fallback). */
  topics: string[];
}

/** Rank pages, pick the strongest sentences and return them with citations. */
export function retrieveContext(question: string, doc: DocLike): Retrieval {
  const { tokens, phrase } = queryTerms(question.trim());
  const { idf } = termTable(doc);

  const rankedPages = doc.pageTexts
    .map((t, i) => ({ i, t, s: scorePage(t, tokens, phrase, idf) }))
    .filter((r) => Number.isFinite(r.s) && r.s > -0.01)
    .sort((a, b) => b.s - a.s);

  const quotes: ContextQuote[] = [];
  for (const r of rankedPages.slice(0, 3)) {
    for (const s of pickSentences(r.t, tokens, phrase, idf, 900)) {
      quotes.push({ page: r.i + 1, text: s });
    }
  }
  if (!quotes.length && rankedPages.length) {
    quotes.push({
      page: rankedPages[0].i + 1,
      text: rankedPages[0].t.replace(/\s+/g, " ").slice(0, 600),
    });
  }
  if (!quotes.length && doc.pageTexts.length) {
    // Last resort: just return first chunk of text
    quotes.push({
      page: 1,
      text: doc.pageTexts[0].replace(/\s+/g, " ").slice(0, 600),
    });
  }

  return { quotes, topics: topTopics(doc, 4) };
}

export function summarise(doc: DocLike): string {
  const nameLabel = `“${doc.name}”`;
  if (doc.pageTexts.every((t) => !t.trim())) {
    return `${nameLabel} has no readable text layer, so I can’t summarise it.`;
  }
  const sents = contentSentences(doc, 3);
  const keep: string[] = [];
  let chars = 0;
  for (const s of sents) {
    if (chars + s.length > 880) break;
    keep.push(s);
    chars += s.length;
  }
  if (!keep.length) keep.push(doc.pageTexts[0].slice(0, 500));

  return `Here’s a quick summary of ${nameLabel} (${doc.numPages} page${plural(
    doc.numPages,
  )}):\n\n${keep.join(
    " ",
  )}\n\nAsk something specific — like “What does it say about storage?” — and I’ll quote the exact page.`;
}

export function explain(doc: DocLike): string {
  const nameLabel = `“${doc.name}”`;
  if (doc.pageTexts.every((t) => !t.trim())) {
    return `${nameLabel} has no readable text layer, so I can’t explain its contents.`;
  }
  const first = contentSentences(doc, 2).slice(0, 2).join(" ");
  return `At a glance, ${nameLabel} is about the following:\n\n${first}\n\nIt runs to ${doc.numPages} page${plural(
    doc.numPages,
  )} in total. Ask me a specific question and I’ll pull the relevant passage with its page number.`;
}

export function rewrite(doc: DocLike): string {
  const nameLabel = `“${doc.name}”`;
  const sents = contentSentences(doc, 2).filter((s) => s.length >= 16);
  if (!sents.length) return `${nameLabel} has no readable text to rewrite.`;

  const plain = sents
    .slice(0, 3)
    .map((s) =>
      s.toLowerCase().replace(/^in (this|the) (report|paper|document)\b/i, "The report"),
    )
    .join(" ");
  return `Here’s a plainer-language version of the opening of ${nameLabel}:\n\n${plain}\n\nThis is a light paraphrase — the full wording is on page 1 of your PDF.`;
}

export function applyAction(action: PdfAction, doc: DocLike): string {
  switch (action) {
    case "Explain":
      return explain(doc);
    case "Summarise":
      return summarise(doc);
    case "Rewrite":
      return rewrite(doc);
    default:
      return summarise(doc);
  }
}

export const NO_DOCUMENT_REPLY =
  "No document is open yet.\n\nDrag & drop a PDF into the viewer on the left (or press “Add Document”) and I’ll read every page — then you can ask me anything about it.";