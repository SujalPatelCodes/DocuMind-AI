import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Conversation } from "../types";

interface Props {
  conversations: Conversation[];
  activeId: string;
  query: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Collapsible white conversation-history sidebar.
 *
 * Expanded (220px): search input, “+ New Conversation” button, TODAY /
 * YESTERDAY groups, and a collapse button in the header row. Every row hides a
 * three-dot button that only appears on hover (or when the row is active);
 * clicking it reveals a small Rename / Delete menu that is otherwise hidden.
 *
 * Collapsed (44px slim rail): minimal strip — just the expand button and
 * the word “Conversations” written vertically (reading bottom → top) in the
 * middle of the section. No chat list is shown while collapsed.
 */
export default function ConversationSidebar({
  conversations,
  activeId,
  query,
  collapsed,
  onToggleCollapsed,
  onQueryChange,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: Props) {
  const today = conversations.filter((c) => c.group === "TODAY");
  const yesterday = conversations.filter((c) => c.group === "YESTERDAY");
  const searching = query.trim().length > 0;

  // Which row's three-dot menu is open, and where to pin it (viewport coords).
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);

  // Escape closes the menu.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  // Collapsing the rail dismisses any open menu / rename.
  useEffect(() => {
    if (collapsed) {
      setMenu(null);
      setEditingId(null);
    }
  }, [collapsed]);

  const openMenu = (e: MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const width = 128;
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8),
    );
    setMenu({ id, top: rect.bottom + 4, left });
  };

  const beginRename = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    cancelRef.current = false;
    setEditingId(id);
    setDraft(conv.title);
    setMenu(null);
  };

  const commitRename = () => {
    if (editingId == null) return;
    const id = editingId;
    setEditingId(null);
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    const next = draft.trim();
    const current = conversations.find((c) => c.id === id)?.title ?? "";
    if (next && next !== current) onRename(id, next);
  };

  const renderRow = (c: Conversation) => {
    const active = c.id === activeId;
    const editing = editingId === c.id;
    const menuOpen = menu?.id === c.id;

    return (
      <div
        key={c.id}
        className={`group flex w-full items-center gap-1 rounded-[7px] py-[6px] pr-1 pl-2 text-[12px] transition-colors ${
          active
            ? "bg-selconv font-medium text-maintext"
            : "text-[#4B5563] hover:bg-[#F6F6F7] hover:text-maintext"
        }`}
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRef.current = true;
                e.currentTarget.blur();
              }
            }}
            onBlur={commitRename}
            aria-label="Rename conversation"
            className="min-w-0 flex-1 rounded-[5px] border border-line bg-white px-1.5 py-[2px] text-[12px] text-maintext focus:border-[#d1d5db] focus:outline-none"
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              title={c.title}
              className="min-w-0 flex-1 truncate text-left"
            >
              {c.title}
            </button>
            <button
              type="button"
              aria-label={`Options for ${c.title}`}
              title="Rename or delete"
              onClick={(e) => openMenu(e, c.id)}
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-subtext transition-opacity hover:bg-black/5 hover:text-maintext ${
                active || menuOpen
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              }`}
            >
              <MoreHorizontal size={13} />
            </button>
          </>
        )}
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /* Collapsed: 44px slim rail — expand button + vertical label only     */
  /* ------------------------------------------------------------------ */
  if (collapsed) {
    return (
      <aside
        aria-label="Conversations"
        className="flex w-[44px] shrink-0 flex-col items-center border-r border-line bg-white py-2"
      >
        <button
          type="button"
          aria-label="Expand conversations"
          title="Expand conversations"
          onClick={onToggleCollapsed}
          className="grid h-7 w-7 place-items-center rounded-lg text-subtext transition-colors hover:bg-light hover:text-maintext"
        >
          <ChevronsRight size={14} />
        </button>

        {/* “Conversations” written vertically, reading bottom → top */}
        <div className="pointer-events-none flex min-h-0 w-full flex-1 flex-col items-center justify-center">
          <span
            className="select-none text-[8px] font-semibold uppercase tracking-[0.2em] text-[#8A8F98]"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Conversations
          </span>
        </div>
      </aside>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Expanded: full 220px sidebar                                        */
  /* ------------------------------------------------------------------ */
  return (
    <aside
      aria-label="Conversations"
      className="flex w-[220px] shrink-0 flex-col gap-2.5 border-r border-line bg-white p-2.5"
    >
      {/* Header row: search + collapse button */}
      <div className="flex items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search for conversation"
            aria-label="Search for conversation"
            className="h-[26px] w-full rounded-lg border border-line bg-white pr-6 pl-2.5 text-[10px] text-maintext placeholder-placeholder focus:border-[#d1d5db] focus:outline-none"
          />
          <Search
            size={12}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-placeholder"
          />
        </div>
        <button
          type="button"
          aria-label="Collapse conversations"
          title="Collapse conversations"
          onClick={onToggleCollapsed}
          className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-subtext transition-colors hover:bg-light hover:text-maintext"
        >
          <ChevronsLeft size={13} />
        </button>
      </div>

      {/* + New Conversation */}
      <button
        type="button"
        onClick={onNew}
        className="flex h-[26px] w-fit items-center justify-center gap-1 self-start rounded-[9px] bg-ink px-3 text-[10px] font-medium text-white transition-opacity hover:opacity-90"
      >
        <Plus size={12} />
        New Conversation
      </button>

      {/* History list */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {today.length > 0 && (
          <>
            <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A8F98]">
              {searching ? "Results" : "Today"}
            </p>
            <div className="mb-2 flex flex-col gap-px">{today.map(renderRow)}</div>
          </>
        )}

        {yesterday.length > 0 && (
          <>
            <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A8F98]">
              Yesterday
            </p>
            <div className="flex flex-col gap-px">{yesterday.map(renderRow)}</div>
          </>
        )}

        {conversations.length === 0 && (
          <p className="px-1 pt-2 text-[9px] text-placeholder">
            No conversations found.
          </p>
        )}
      </div>

      {/* Three-dot dropdown — fixed so the scroll container can't clip it */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onMouseDown={() => setMenu(null)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="fixed z-50 w-[128px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
            style={{ top: menu.top, left: menu.left }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => beginRename(menu.id)}
              className="flex w-full items-center gap-2 px-2.5 py-[6px] text-left text-[11px] text-maintext transition-colors hover:bg-light"
            >
              <Pencil size={12} className="text-subtext" />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDelete(menu.id);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-[6px] text-left text-[11px] text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
            >
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
