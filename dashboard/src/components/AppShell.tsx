import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";
import type {
  ChatMessage,
  Conversation,
  ModelId,
  NavKey,
  PdfAction,
} from "../types";
import { CONVERSATIONS, INITIAL_MESSAGES } from "../data/mockData";
import { buildSamplePdf, loadPdfDocument } from "../pdf";
import type { PdfDocument } from "../pdf";
import { NO_DOCUMENT_REPLY, suggestedTopic } from "../qa";
import {
  answerQuestionWithModel,
  runActionWithModel,
} from "../assistant";
import NavigationSidebar from "./NavigationSidebar";
import ConversationSidebar from "./ConversationSidebar";
import TopHeader from "./TopHeader";
import DocumentToolbar from "./DocumentToolbar";
import PDFViewer from "./PDFViewer";
import ChatPanel from "./ChatPanel";

let nextId = 0;
const uid = (prefix: string) => `${prefix}-${++nextId}-${Date.now()}`;

/**
 * Owns every piece of dashboard state. The document is real: a PDF is loaded
 * with pdf.js (a sample report is generated at startup), every page's text is
 * extracted, and chat answers quote the document page by page.
 */
export default function AppShell() {
  const [conversations, setConversations] =
    useState<Conversation[]>(CONVERSATIONS);
  const [activeConvId, setActiveConvId] = useState<string>("c1");
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({
    c1: INITIAL_MESSAGES,
  });
  const [model, setModel] = useState<ModelId>("llama3.2:3b");
  const [convQuery, setConvQuery] = useState("");
  const [convCollapsed, setConvCollapsed] = useState(false);
  const [pdfCollapsed, setPdfCollapsed] = useState(false);
  const [navKey, setNavKey] = useState<NavKey>("docs");
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfSearchOpen, setPdfSearchOpen] = useState(false);
  const [pdfQuery, setPdfQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);

  // The opened PDF (real): parsed document + extracted text.
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [documentName, setDocumentName] = useState("Energy-Transition-Report-2024.pdf");
  const [pages, setPages] = useState(6);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messages = messagesByConv[activeConvId] ?? [];

  const appendMessage = useCallback((convId: string, message: ChatMessage) => {
    setMessagesByConv((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), message],
    }));
  }, []);

  /** Swap the text of one message (used to turn the “Thinking…” bubble into
   *  the model's finished reply). */
  const patchMessage = useCallback((convId: string, id: string, text: string) => {
    setMessagesByConv((prev) => ({
      ...prev,
      [convId]: (prev[convId] ?? []).map((m) =>
        m.id === id ? { ...m, text } : m,
      ),
    }));
  }, []);

  const timeNow = () =>
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  /** Open a File as the active document (PDF via pdf.js, text extracted). */
  const loadPdfFile = useCallback(
    async (file: File, announce: boolean) => {
      setDocBusy(true);
      try {
        const loaded = await loadPdfDocument(file);
        setDoc(loaded);
        setDocumentName(loaded.name);
        setPages(loaded.numPages);
        if (announce) {
          const topic = suggestedTopic(loaded);
          appendMessage(activeConvId, {
            id: uid("m"),
            role: "assistant",
            time: "Just now",
            text:
              `”${loaded.name}” opened — ${loaded.numPages} page${loaded.numPages === 1 ? "" : "s"}. ` +
              `I’ve read every page and I’m ready.\n\nTry: “What does it say about ${topic}?” or “Summarise the report”.`,
          });
        }
      } catch (error) {
        appendMessage(activeConvId, {
          id: uid("m"),
          role: "assistant",
          time: "Just now",
          text: `I couldn’t open “${file.name}”: ${
            error instanceof Error ? error.message : String(error)
          }. Please try a valid PDF.`,
        });
      } finally {
        setDocBusy(false);
      }
    },
    [activeConvId, appendMessage],
  );

  // Keep a ref so the startup effect (below) never re-runs on identity change.
  const loadRef = useRef(loadPdfFile);
  loadRef.current = loadPdfFile;

  const sampleStarted = useRef(false);
  useEffect(() => {
    if (sampleStarted.current) return;
    sampleStarted.current = true;
    buildSamplePdf()
      .then((file) => loadRef.current(file, true))
      .catch(() => {
        /* leave the drop-zone empty if the sample can't be generated */
      });
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleNav = useCallback(
    (key: NavKey) => {
      setNavKey(key);
      if (key === "upload") openFilePicker();
    },
    [openFilePicker],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files && files[0];
      if (!file) return;
      void loadPdfFile(file, true);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [loadPdfFile],
  );

  const handleSend = useCallback(
    async (text: string) => {
      const convId = activeConvId;
      const trimmed = text.trim();
      if (!trimmed) return;
      appendMessage(convId, {
        id: uid("m"),
        role: "user",
        time: timeNow(),
        text: trimmed,
      });
      if (!doc) {
        appendMessage(convId, {
          id: uid("m"),
          role: "assistant",
          time: timeNow(),
          text: NO_DOCUMENT_REPLY,
        });
        return;
      }
      // Show a “Thinking…” bubble, then swap in llama3.2:3b's answer.
      const markerId = uid("m");
      appendMessage(convId, {
        id: markerId,
        role: "assistant",
        time: timeNow(),
        text: "Thinking…",
      });
      const started = Date.now();
      const reply = await answerQuestionWithModel(trimmed, doc, model);
      const elapsed = Date.now() - started;
      if (elapsed < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
      }
      patchMessage(convId, markerId, reply);
    },
    [activeConvId, appendMessage, patchMessage, doc, model],
  );

  const handlePdfAction = useCallback(
    async (action: PdfAction) => {
      const convId = activeConvId;
      if (!doc) {
        appendMessage(convId, {
          id: uid("m"),
          role: "assistant",
          time: timeNow(),
          text: "Open a PDF first — then I can explain, summarise or rewrite it.",
        });
        return;
      }
      const markerId = uid("m");
      appendMessage(convId, {
        id: markerId,
        role: "assistant",
        time: timeNow(),
        text: "Thinking…",
      });
      const started = Date.now();
      const reply = await runActionWithModel(action, doc, model);
      const elapsed = Date.now() - started;
      if (elapsed < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
      }
      patchMessage(convId, markerId, reply);
    },
    [activeConvId, appendMessage, patchMessage, doc, model],
  );

  const handleNewConversation = useCallback(() => {
    const id = uid("c");
    const fresh: Conversation = { id, title: "New Conversation", group: "TODAY" };
    setConversations((prev) => [fresh, ...prev]);
    setActiveConvId(id);
    setMessagesByConv((prev) => ({ ...prev, [id]: [] }));
    setConvQuery("");
  }, []);

  const filteredConversations = useMemo(() => {
    const q = convQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, convQuery]);

  return (
    <div className="flex h-full w-full bg-white">
      {/* Hidden file picker backing every “add document” affordance */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <NavigationSidebar active={navKey} onSelect={handleNav} />

      <ConversationSidebar
        conversations={filteredConversations}
        activeId={activeConvId}
        query={convQuery}
        collapsed={convCollapsed}
        onToggleCollapsed={() => setConvCollapsed((c) => !c)}
        onQueryChange={setConvQuery}
        onSelect={setActiveConvId}
        onNew={handleNewConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          model={model}
          onModelChange={setModel}
          onAddDocument={openFilePicker}
        />

        <DocumentToolbar documentName={documentName} />

        <div className="flex min-h-0 flex-1">
          {pdfCollapsed ? (
            /* Collapsed document rail: expand button + vertical label only */
            <aside
              aria-label="Document viewer"
              className="flex w-[44px] shrink-0 flex-col items-center border-r border-[#E9EAEC] bg-pdfbg py-2"
            >
              <button
                type="button"
                aria-label="Expand document viewer"
                title="Expand document viewer"
                onClick={() => setPdfCollapsed(false)}
                className="grid h-7 w-7 place-items-center rounded-lg text-subtext transition-colors hover:bg-light hover:text-maintext"
              >
                <ChevronsRight size={14} />
              </button>

              {/* “Opened PDF” written vertically, reading bottom → top */}
              <div className="pointer-events-none flex min-h-0 w-full flex-1 flex-col items-center justify-center">
                <span
                  className="select-none text-[8px] font-semibold uppercase tracking-[0.18em] text-[#8A8F98]"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  Opened PDF
                </span>
              </div>
            </aside>
          ) : (
            <PDFViewer
              zoom={pdfZoom}
              onZoomChange={setPdfZoom}
              searchOpen={pdfSearchOpen}
              query={pdfQuery}
              onToggleSearch={() => {
                setPdfSearchOpen((open) => !open);
                setPdfQuery("");
              }}
              onQueryChange={setPdfQuery}
              selectMode={selectMode}
              onToggleSelect={() => setSelectMode((m) => !m)}
              onAction={handlePdfAction}
              documentName={documentName}
              pages={pages}
              doc={doc}
              loading={docBusy}
              onLoadFile={(file) => void loadPdfFile(file, true)}
              onAddDocument={openFilePicker}
              onToggleCollapsed={() => setPdfCollapsed(true)}
            />
          )}
          <ChatPanel messages={messages} onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}