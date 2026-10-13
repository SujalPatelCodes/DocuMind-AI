import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  ChevronsLeft,
  Loader2,
  MousePointer2,
  Plus,
  Search,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PdfAction } from "../types";
import { buildSpans } from "../pdf";
import type { PdfDocument, TextSpan } from "../pdf";
import PDFActionToolbar from "./PDFActionToolbar";

interface Props {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  searchOpen: boolean;
  query: string;
  onToggleSearch: () => void;
  onQueryChange: (value: string) => void;
  selectMode: boolean;
  onToggleSelect: () => void;
  onAction: (action: PdfAction) => void;
  documentName: string;
  pages: number;
  doc: PdfDocument | null;
  loading: boolean;
  onLoadFile: (file: File) => void;
  onAddDocument: () => void;
  onToggleCollapsed: () => void;
}

/** One real PDF page: canvas + transparent text overlay (selectable,
 *  with search hits highlighted). */
function PdfPageView({
  doc,
  pageNumber,
  scale,
  query,
}: {
  doc: PdfDocument;
  pageNumber: number;
  scale: number;
  query: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [spans, setSpans] = useState<TextSpan[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const wanted = query.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setFailed(null);
    (async () => {
      try {
        const page = await doc.proxy.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        taskRef.current?.cancel();
        taskRef.current = null;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.floor(viewport.width);
        const h = Math.floor(viewport.height);
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const task = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        taskRef.current = task;
        await task.promise;
        if (cancelled) return;
        taskRef.current = null;

        setDims({ w, h });
        setSpans(buildSpans(doc.textItems[pageNumber - 1] ?? [], viewport.transform));
      } catch (error) {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
      taskRef.current?.cancel();
      taskRef.current = null;
    };
  }, [doc, pageNumber, scale]);

  return (
    <div aria-label={`Page ${pageNumber}`} className="mb-3 flex w-full justify-center">
      <div
        className="relative rounded-[2px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.07),0_0_0_1px_rgba(0,0,0,0.03)]"
        style={{ width: dims?.w, height: dims?.h }}
      >
        <canvas ref={canvasRef} className="block rounded-[2px]" />
        <div className="pdf-text absolute inset-0 overflow-hidden">
          {spans?.map((s, idx) => {
            const hit = wanted.length > 0 && s.str.toLowerCase().includes(wanted);
            return (
              <span
                key={idx}
                className={hit ? "bg-accent/45" : undefined}
                style={{
                  left: s.left,
                  top: s.top,
                  fontSize: s.fontPx,
                  width: s.width,
                  lineHeight: 1,
                }}
              >
                {s.str}
              </span>
            );
          })}
        </div>
        {failed && (
          <p className="p-6 text-center text-[9.5px] italic text-placeholder">
            Page {pageNumber} preview unavailable{failed ? ` — ${failed}` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Left document pane (~48% of the workspace). Renders the opened PDF for
 * real (pdf.js → canvas + selectable text layer), scrolls through every
 * page, and accepts drag & drop of a new PDF anywhere in the pane.
 */
export default function PDFViewer({
  zoom,
  onZoomChange,
  searchOpen,
  query,
  onToggleSearch,
  onQueryChange,
  selectMode,
  onToggleSelect,
  onAction,
  documentName,
  pages,
  doc,
  loading,
  onLoadFile,
  onAddDocument,
  onToggleCollapsed,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(0);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setAreaW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paperW = doc && areaW > 0 ? Math.max(140, areaW - 12) : 0;
  const baseScale = doc && paperW ? paperW / doc.pageWidthAtScale1 : 1;
  const pageScale = baseScale * zoom;

  const handleDragOver = (e: DragEvent<Element>) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<Element>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragging(false);
    }
  };

  const handleDrop = (e: DragEvent<Element>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onLoadFile(file);
  };

  const step = 0.1;
  const maxZoom = 1.4;
  const minZoom = 0.6;
  const hasDoc = doc !== null;

  return (
    <section
      aria-label="Document viewer"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex w-[48%] min-w-0 flex-col bg-pdfbg"
    >
      {/* Floating PDF action toolbar */}
      <PDFActionToolbar onAction={onAction} />

      {/* Inline search field (top-left, appears when search is toggled) */}
      {searchOpen && (
        <div className="absolute left-2 top-2 z-20 flex h-[24px] w-[136px] items-center gap-1 rounded-md border border-line bg-white px-1.5 shadow-sm">
          <Search size={11} className="shrink-0 text-placeholder" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search document…"
            aria-label="Search document"
            className="min-w-0 flex-1 bg-transparent text-[9px] text-maintext placeholder-placeholder focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={onToggleSearch}
            className="grid h-4 w-4 shrink-0 place-items-center rounded text-placeholder hover:text-maintext"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Main area: loading → spinner; doc → real pages; none → drop zone */}
      {loading ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-subtext">
          <Loader2 size={18} className="animate-spin" />
          <p className="text-[10px] text-placeholder">Reading PDF…</p>
        </div>
      ) : doc ? (
        <div
          ref={scrollRef}
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 pt-[38px]"
          style={{ cursor: selectMode ? "text" : "default" }}
        >
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPageView
              key={i}
              doc={doc}
              pageNumber={i + 1}
              scale={pageScale}
              query={query}
            />
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6"
        >
          <div className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-[#C9CDD4] bg-white text-[#6B7280]">
            <UploadCloud size={20} />
          </div>
          <div className="text-center">
            <p className="text-[11.5px] font-medium text-maintext">
              Drag & drop your PDF here
            </p>
            <p className="mt-1 text-[9.5px] leading-relaxed text-placeholder">
              Drop a file anywhere in this pane, or browse — the assistant will
              read every page so you can chat about it.
            </p>
          </div>
          <button
            type="button"
            aria-label="Browse for a PDF"
            onClick={onAddDocument}
            className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-4 text-[10px] font-medium text-white transition-opacity hover:opacity-85"
          >
            <Plus size={12} /> Browse files
          </button>
        </div>
      )}

      {/* Drag-over overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent/10">
          <div className="flex h-20 w-64 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-accent bg-white/90 shadow-md">
            <UploadCloud size={18} className="text-[#B8860B]" />
            <p className="text-[10.5px] font-medium text-maintext">
              Drop to open the PDF
            </p>
          </div>
        </div>
      )}

      {/* Bottom document controls */}
      <div className="flex h-[34px] shrink-0 items-center justify-between border-t border-[#E9EAEC] bg-white px-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Collapse document viewer"
            title="Collapse document viewer"
            onClick={onToggleCollapsed}
            className="grid h-7 w-7 place-items-center rounded-md text-[#4B5563] transition-colors hover:bg-light hover:text-maintext"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            title={hasDoc ? "Zoom out" : "Open a PDF to zoom"}
            disabled={!hasDoc}
            onClick={() => onZoomChange(Math.max(minZoom, +(zoom - step).toFixed(2)))}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
              hasDoc
                ? "text-[#4B5563] hover:bg-light hover:text-maintext"
                : "cursor-not-allowed text-[#C9CDD4]"
            }`}
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title={hasDoc ? "Zoom in" : "Open a PDF to zoom"}
            disabled={!hasDoc}
            onClick={() => onZoomChange(Math.min(maxZoom, +(zoom + step).toFixed(2)))}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
              hasDoc
                ? "text-[#4B5563] hover:bg-light hover:text-maintext"
                : "cursor-not-allowed text-[#C9CDD4]"
            }`}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            aria-label="Search"
            title="Search document"
            onClick={onToggleSearch}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
              searchOpen
                ? "bg-light text-maintext"
                : "text-[#4B5563] hover:bg-light hover:text-maintext"
            }`}
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            aria-label="Select text"
            title="Select text"
            onClick={onToggleSelect}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
              selectMode
                ? "bg-light text-maintext"
                : "text-[#4B5563] hover:bg-light hover:text-maintext"
            }`}
          >
            <MousePointer2 size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Add document"
            title="Add a new document"
            onClick={onAddDocument}
            className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 text-[9px] font-medium text-maintext transition-colors hover:bg-light"
          >
            <Plus size={11} />
            Add Document
          </button>
          <p
            className="text-[9px] text-maintext"
            title={`${documentName} — ${pages} pages`}
          >
            {hasDoc ? `Page 1 of ${pages}` : "No document"}
          </p>
        </div>
      </div>
    </section>
  );
}