import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";
import type {
  ChatMessage,
  Conversation,
  ModelId,
  NavKey,
  PdfAction,
} from "../types";
import { api, persist } from "../api";
import { buildSamplePdf, loadPdfDocumentData } from "../pdf";
import type { PdfDocument } from "../pdf";
import { NO_DOCUMENT_REPLY, suggestedTopic } from "../qa";
import {
  answerQuestionWithModel,
  runActionWithModel,
} from "../assistant";
import NavigationSidebar from "./NavigationSidebar";
import ConversationSidebar from "./ConversationSidebar";
import TopHeader from "./TopHeader";
import PDFViewer from "./PDFViewer";
import ChatPanel from "./ChatPanel";

let nextId = 0;
const uid = (prefix: string) => `${prefix}-${++nextId}-${Date.now()}`;

/** One conversation's document slot: the parsed PDF, a loading marker, or an
 *  error marker (so the viewer can fall back to its empty state). */
type ConvDoc = PdfDocument | "loading" | "error";

interface DocMeta {
  name: string;
  numPages: number;
}

/**
 * Owns every piece of dashboard state. Each conversation has its **own** PDF:
 * a document opened in one conversation never leaks into another, a brand-new
 * conversation starts with an empty viewer you can drop a file into, and the
 * document (plus its metadata) is stored in SQLite so it survives a refresh.
 */
export default function AppShell() {
  // Conversations/messages/settings are hydrated from the local SQLite API on
  // mount and mirrored back on every change, so a refresh restores the session.
  const [ready, setReady] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({});
  const [model, setModel] = useState<ModelId>("llama3.2:3b");
  const [convQuery, setConvQuery] = useState("");
  const [convCollapsed, setConvCollapsed] = useState(false);
  const [pdfCollapsed, setPdfCollapsed] = useState(false);
  const [navKey, setNavKey] = useState<NavKey>("docs");
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfSearchOpen, setPdfSearchOpen] = useState(false);
  const [pdfQuery, setPdfQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);

  // Per-conversation documents: parsed docs cached in memory, metadata mirrored
  // to SQLite so the association (and the file itself) survives a refresh.
  const [docsByConv, setDocsByConv] = useState<Record<string, ConvDoc>>({});
  const [docMeta, setDocMeta] = useState<Record<string, DocMeta>>({});
  const [docBusy, setDocBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messages = messagesByConv[activeConvId] ?? [];

  // The active conversation's document (null while it has none or is loading).
  const activeEntry = docsByConv[activeConvId];
  const doc = activeEntry && typeof activeEntry === "object" ? activeEntry : null;
  const activeMeta = docMeta[activeConvId] ?? null;
  const documentName = activeMeta?.name ?? "";
  const pages = activeMeta?.numPages ?? 0;
  const docLoading = docBusy || activeEntry === "loading";

  // Refs give the lazy-load effect current values without becoming dependencies
  // (which would make the effect cancel its own in-flight request).
  const docsRef = useRef(docsByConv);
  docsRef.current = docsByConv;
  const docMetaRef = useRef(docMeta);
  docMetaRef.current = docMeta;
  const inFlightRef = useRef<Set<string>>(new Set());

  const appendMessage = useCallback((convId: string, message: ChatMessage) => {
    setMessagesByConv((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), message],
    }));
    persist(api.addMessage(convId, message));
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
    persist(api.patchMessage(convId, id, text));
  }, []);

  const timeNow = () =>
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  /** Open a File as the **active conversation's** document and persist it. */
  const loadPdfFile = useCallback(
    async (file: File, announce: boolean) => {
      const convId = activeConvId;
      if (!convId) return;
      setDocBusy(true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loaded = await loadPdfDocumentData(bytes, file.name);
        setDocsByConv((prev) => ({ ...prev, [convId]: loaded }));
        setDocMeta((prev) => ({
          ...prev,
          [convId]: { name: loaded.name, numPages: loaded.numPages },
        }));
        persist(api.saveDocument(convId, loaded.name, loaded.numPages, bytes));
        if (announce) {
          const topic = suggestedTopic(loaded);
          appendMessage(convId, {
            id: uid("m"),
            role: "assistant",
            time: "Just now",
            text:
              `”${loaded.name}” opened — ${loaded.numPages} page${loaded.numPages === 1 ? "" : "s"}. ` +
              `I’ve read every page and I’m ready.\n\nTry: “What does it say about ${topic}?” or “Summarise the report”.`,
          });
        }
      } catch (error) {
        appendMessage(convId, {
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

  /** Close the active conversation's document — the viewer returns to its
   *  empty state and the PDF is dropped from SQLite. */
  const handleRemoveDocument = useCallback(() => {
    const convId = activeConvId;
    if (!convId) return;
    setDocsByConv((prev) => {
      const next = { ...prev };
      delete next[convId];
      return next;
    });
    setDocMeta((prev) => {
      const next = { ...prev };
      delete next[convId];
      return next;
    });
    persist(api.deleteDocument(convId));
    appendMessage(convId, {
      id: uid("m"),
      role: "assistant",
      time: timeNow(),
      text:
        "I closed the document for this conversation. Drop in another PDF and " +
        "I’ll read it.",
    });
  }, [activeConvId, appendMessage]);

  // Hydrate from the local API (SQLite). The API ships with Vite, so a failure
  // is a transient startup race — retry briefly rather than inventing demo
  // conversations that do not exist in the database (they would silently vanish
  // on the next refresh). If it stays down we show an explicit banner.
  const hydrate = useCallback(async () => {
    setApiError(false);
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const state = await api.getState();
        setConversations(state.conversations);
        setMessagesByConv(state.messages);
        setDocMeta(state.documents ?? {});
        model: (["llama3.2:3b", "qwen3.5:9b", "qwen2.5vl:3b"] as ModelId[]).includes(
          state.settings.model as ModelId,
        )
          ? (state.settings.model as ModelId)
          : "llama3.2:3b",
        setActiveConvId(
          state.settings.activeConvId ?? state.conversations[0]?.id ?? "",
        );
        setReady(true);
        return;
      } catch (error) {
        if (attempt === 5) {
          console.warn("[documind] local storage unavailable:", error);
          setApiError(true);
          setReady(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Lazy-load the active conversation's saved PDF (bytes → parsed document).
  useEffect(() => {
    if (!ready || !activeConvId) return;
    const convId = activeConvId;
    if (!docMetaRef.current[convId]) return;
    if (docsRef.current[convId] !== undefined) return;
    if (inFlightRef.current.has(convId)) return;

    inFlightRef.current.add(convId);
    setDocsByConv((prev) => ({ ...prev, [convId]: "loading" }));
    api
      .getDocument(convId)
      .then(async (saved) => {
        if (!saved) {
          setDocsByConv((prev) => ({ ...prev, [convId]: "error" }));
          return;
        }
        const loaded = await loadPdfDocumentData(saved.bytes, saved.name);
        setDocsByConv((prev) => ({ ...prev, [convId]: loaded }));
      })
      .catch((error) => {
        console.warn("[documind] failed to load conversation PDF:", error);
        setDocsByConv((prev) => ({ ...prev, [convId]: "error" }));
      })
      .finally(() => {
        inFlightRef.current.delete(convId);
      });
  }, [ready, activeConvId]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /** Drop the bundled sample report into the active (empty) conversation. */
  const handleLoadSample = useCallback(() => {
    void buildSamplePdf().then((file) => loadPdfFile(file, true));
  }, [loadPdfFile]);

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
    persist(api.createConversation(fresh));
    persist(api.saveSettings({ activeConvId: id }));
  }, []);

  /** Switch the active conversation (its own document + messages) and remember it. */
  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id);
    persist(api.saveSettings({ activeConvId: id }));
  }, []);

  /** Remember the chosen model across reloads. */
  const handleModelChange = useCallback((next: ModelId) => {
    setModel(next);
    persist(api.saveSettings({ model: next }));
  }, []);

  /** Rename a conversation from its three-dot menu. */
  const handleRenameConversation = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: clean } : c)),
    );
    persist(api.renameConversation(id, clean));
  }, []);

  /** Delete a conversation (its messages and its PDF). If it was the active one,
   *  fall back to the next conversation — or a fresh one when none remain. */
  const handleDeleteConversation = useCallback(
    (id: string) => {
      persist(api.deleteConversation(id));
      const remaining = conversations.filter((c) => c.id !== id);
      setMessagesByConv((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDocsByConv((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDocMeta((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (remaining.length > 0) {
        setConversations(remaining);
        if (activeConvId === id) {
          setActiveConvId(remaining[0].id);
          persist(api.saveSettings({ activeConvId: remaining[0].id }));
        }
      } else {
        const fresh: Conversation = {
          id: uid("c"),
          title: "New Conversation",
          group: "TODAY",
        };
        setConversations([fresh]);
        setMessagesByConv((prev) => ({ ...prev, [fresh.id]: [] }));
        setActiveConvId(fresh.id);
        persist(api.createConversation(fresh));
        persist(api.saveSettings({ activeConvId: fresh.id }));
      }
    },
    [conversations, activeConvId],
  );

  const filteredConversations = useMemo(() => {
    const q = convQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, convQuery]);

  return (
    <div className="relative flex h-full w-full bg-white">
      {/* Only shown when SQLite can't be reached — never fake data instead. */}
      {apiError && (
        <div className="absolute inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-[#FEF2F2] px-3 py-1.5 text-[11px] text-[#B91C1C] shadow-sm">
          <span>Local storage is unreachable — changes can’t be saved.</span>
          <button
            type="button"
            onClick={() => {
              setReady(false);
              void hydrate();
            }}
            className="font-medium underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

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
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onRename={handleRenameConversation}
        onDelete={handleDeleteConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          model={model}
          onModelChange={handleModelChange}
          onAddDocument={openFilePicker}
        />

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
              loading={docLoading}
              onLoadFile={(file) => void loadPdfFile(file, true)}
              onAddDocument={openFilePicker}
              onLoadSample={handleLoadSample}
              onRemoveDocument={handleRemoveDocument}
              onToggleCollapsed={() => setPdfCollapsed(true)}
            />
          )}
          <ChatPanel messages={messages} onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
