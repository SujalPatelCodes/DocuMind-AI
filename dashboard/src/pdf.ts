import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ABSTRACT_TEXT,
  BODY1,
  BODY2,
  METHODS_TEXT,
  RESULTS_TEXT,
  DISCUSSION_TEXT,
  DISCUSSION2_TEXT,
  CONCLUSION_TEXT,
  CONCLUSION2_TEXT,
  OUTLOOK_TEXT,
} from "./data/mockData";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** One raw text item from a PDF page (kept un-scaled; geometry is
 *  recomputed per viewport when rendering). */
export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  hasEOL: boolean;
}

/** Fully-loaded document: the pdf.js proxy plus every piece of text the
 *  chatbot and the viewer need. */
export interface PdfDocument {
  name: string;
  numPages: number;
  /** Width in CSS px of page 1 at zoom 1 — used to fit pages to the pane. */
  pageWidthAtScale1: number;
  /** Readable text of every page (index 0 = page 1), newline separated. */
  pageTexts: string[];
  /** Raw text items per page (index 0 = page 1). */
  textItems: PdfTextItem[][];
  proxy: PDFDocumentProxy;
}

/** A positioned text span for the selectable/highlightable overlay. */
export interface TextSpan {
  str: string;
  left: number;
  top: number;
  width: number;
  fontPx: number;
}

/* ------------------------------------------------------------------ */
/*  Loading + text extraction                                          */
/* ------------------------------------------------------------------ */

const itemsCache = new WeakMap<PDFDocumentProxy, PdfTextItem[][]>();

type RawItem = {
  str?: unknown;
  transform?: number[];
  width?: unknown;
  hasEOL?: unknown;
};

async function getTextItems(
  proxy: PDFDocumentProxy,
  pageNum: number,
): Promise<PdfTextItem[]> {
  let cache = itemsCache.get(proxy);
  if (!cache) {
    cache = [];
    itemsCache.set(proxy, cache);
  }
  if (cache[pageNum - 1]) return cache[pageNum - 1];

  const page = await proxy.getPage(pageNum);
  const content = await page.getTextContent();
  const items: PdfTextItem[] = (content.items as RawItem[])
    .filter((it) => typeof it.str === "string")
    .map((it) => ({
      str: it.str as string,
      transform: it.transform ?? [1, 0, 0, 1, 0, 0],
      width: typeof it.width === "number" ? it.width : 0,
      hasEOL: it.hasEOL === true,
    }));
  cache[pageNum - 1] = items;
  return items;
}

/**
 * Parse a PDF from raw bytes (used when restoring a conversation's saved
 * document from the API). `name` is only used for display.
 */
export async function loadPdfDocumentData(
  bytes: Uint8Array,
  name: string,
): Promise<PdfDocument> {
  // Hand pdf.js its own copy — the worker may take ownership of the buffer, and
  // callers still need the original bytes to persist the document.
  const proxy = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const numPages = proxy.numPages;

  const pageTexts: string[] = [];
  const textItems: PdfTextItem[][] = [];
  let pageWidthAtScale1 = 612;

  for (let n = 1; n <= numPages; n++) {
    const items = await getTextItems(proxy, n);
    if (n === 1) {
      pageWidthAtScale1 = (await proxy.getPage(1)).getViewport({ scale: 1 }).width;
    }
    const lines: string[] = [];
    let line = "";
    const flush = () => {
      if (line.trim()) lines.push(line.trim());
      line = "";
    };
    for (const it of items) {
      line += it.str;
      if (it.hasEOL) flush();
    }
    flush();
    pageTexts.push(lines.join("\n"));
    textItems.push(items);
  }

  return { name, numPages, pageWidthAtScale1, pageTexts, textItems, proxy };
}

/** Read a File and parse it into a fully-loaded document. */
export async function loadPdfDocument(file: File): Promise<PdfDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return loadPdfDocumentData(bytes, file.name);
}

/* ------------------------------------------------------------------ */
/*  Rendering helpers                                                  */
/* ------------------------------------------------------------------ */

/** 2×3 affine composition (the same math pdf.js uses for text layers). */
export function composeTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Turn a page's raw text items into positioned CSS spans for the overlay. */
export function buildSpans(
  items: PdfTextItem[],
  viewportTransform: number[],
): TextSpan[] {
  return items.map((it) => {
    const tx = composeTransform(viewportTransform, it.transform);
    const fontPx = Math.hypot(tx[2], tx[3]);
    const horiz = Math.hypot(tx[0], tx[1]) || 1;
    return {
      str: it.str,
      left: tx[4],
      top: tx[5],
      width: it.width * horiz,
      fontPx,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Runtime-generated sample PDF (so the dashboard opens populated      */
/*  with a real, queryable document — no asset file needed).           */
/* ------------------------------------------------------------------ */

const SAMPLE_NAME = "Energy-Transition-Report-2024.pdf";

export async function buildSamplePdf(): Promise<File> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const W = 612;
  const H = 792;
  const M = 58;
  const maxW = W - M * 2;

  const ink = rgb(0.16, 0.16, 0.16);
  const muted = rgb(0.42, 0.45, 0.52);
  const rule = rgb(0.83, 0.85, 0.88);

  let page = pdf.addPage([W, H]);
  let y = H - 140;

  const addPage = () => {
    const p = pdf.addPage([W, H]);
    p.drawText("The 2024 Global Energy Transition Report", {
      x: M,
      y: H - 34,
      size: 8,
      font: italic,
      color: muted,
    });
    p.drawLine({
      start: { x: M, y: H - 40 },
      end: { x: W - M, y: H - 40 },
      thickness: 0.6,
      color: rule,
    });
    return p;
  };

  const ensureRoom = (needed: number) => {
    if (y - needed < M) {
      page = addPage();
      y = H - M - 8;
    }
  };

  const wrapLines = (text: string, size: number): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const word of text.split(/\s+/)) {
      const probe = cur ? `${cur} ${word}` : word;
      if (!cur || font.widthOfTextAtSize(probe, size) <= maxW) cur = probe;
      else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  const para = (text: string, size = 10.5, gap = 9) => {
    for (const ln of wrapLines(text, size)) {
      ensureRoom(size + 4.5);
      page.drawText(ln, { x: M, y, size, font, color: ink });
      y -= size + 4.5;
    }
    y -= gap;
  };

  const heading = (text: string, size = 12.5) => {
    ensureRoom(size + 8);
    page.drawText(text, { x: M, y, size, font: bold, color: ink });
    y -= size + 7;
  };

  // Page 1 title block
  page.drawText("DocuMind", { x: M, y: H - 46, size: 8.5, font: bold, color: muted });
  page.drawText("The 2024 Global Energy Transition Report", {
    x: M,
    y: H - 92,
    size: 19,
    font: bold,
    color: ink,
  });
  page.drawText("Innovations in solar, storage and grid flexibility", {
    x: M,
    y: H - 110,
    size: 11.5,
    font: italic,
    color: muted,
  });
  page.drawLine({
    start: { x: M, y: H - 122 },
    end: { x: W - M, y: H - 122 },
    thickness: 0.9,
    color: rule,
  });

  heading("Abstract");
  para(ABSTRACT_TEXT);

  heading("1   Introduction");
  para(`${BODY1} ${BODY2}`.replace(/\s+/g, " "));

  heading("2   Methods");
  para(METHODS_TEXT);

  heading("3   Results");
  para(RESULTS_TEXT);

  heading("4   Discussion");
  para(`${DISCUSSION_TEXT} ${DISCUSSION2_TEXT}`.replace(/\s+/g, " "));

  heading("5   Conclusion");
  para(`${CONCLUSION_TEXT} ${CONCLUSION2_TEXT}`.replace(/\s+/g, " "));

  heading("6   Outlook");
  para(OUTLOOK_TEXT);

  // Footers
  const total = pdf.getPageCount();
  pdf.getPages().forEach((pg, i) => {
    pg.drawText(`${i + 1}  /  ${total}`, { x: W / 2 - 12, y: 30, size: 8.5, font, color: muted });
  });

  pdf.setTitle("The 2024 Global Energy Transition Report");
  const bytes = await pdf.save();
  return new File([bytes], SAMPLE_NAME, { type: "application/pdf" });
}