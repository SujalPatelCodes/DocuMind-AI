import {
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  Plus,
  Search,
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
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={`group flex w-full items-center gap-1 rounded-[7px] px-2 py-[6px] text-left text-[12px] transition-colors ${
        active
          ? "bg-selconv font-medium text-maintext"
          : "text-[#4B5563] hover:bg-[#F6F6F7] hover:text-maintext"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
      {active && (
        <span className="shrink-0 text-subtext" aria-label="More options">
          <MoreHorizontal size={12} />
        </span>
      )}
    </button>
  );
}

/**
 * Collapsible white conversation-history sidebar.
 *
 * Expanded (220px): search input, “+ New Conversation” button, TODAY /
 * YESTERDAY groups, and a collapse button in the header row.
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
}: Props) {
  const today = conversations.filter((c) => c.group === "TODAY");
  const yesterday = conversations.filter((c) => c.group === "YESTERDAY");
  const searching = query.trim().length > 0;

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
            <div className="mb-2 flex flex-col gap-px">
              {today.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </>
        )}

        {yesterday.length > 0 && (
          <>
            <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8A8F98]">
              Yesterday
            </p>
            <div className="flex flex-col gap-px">
              {yesterday.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </>
        )}

        {conversations.length === 0 && (
          <p className="px-1 pt-2 text-[9px] text-placeholder">
            No conversations found.
          </p>
        )}
      </div>
    </aside>
  );
}