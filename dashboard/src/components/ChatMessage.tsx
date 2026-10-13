import { useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp, User } from "lucide-react";
import type { ChatMessage } from "../types";

interface Props {
  message: ChatMessage;
}

function ActionIcon({
  label,
  children,
  active,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-4 w-4 place-items-center rounded transition-colors ${
        active ? "text-maintext" : "text-placeholder hover:text-subtext"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One chat bubble. Assistant messages are white with yellow avatar and
 * copy / thumbs-up / thumbs-down actions; user messages are black bubbles
 * aligned right with a small profile avatar.
 */
export default function ChatMessage({ message }: Props) {
  const [copied, setCopied] = useState(false);
  const [like, setLike] = useState<"up" | "down" | null>(null);

  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message.text).catch(() => undefined);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[250px]">
          <div className="rounded-[14px] bg-ink px-3 py-2 text-[10px] leading-snug text-white">
            {message.text}
          </div>
          <p className="mt-1 text-right text-[8px] text-placeholder">{message.time}</p>
        </div>
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E5E7EB] text-subtext">
          <User size={12} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* yellow-and-black assistant logo */}
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-ink">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 9.5c.6-1.1 1.9-1.8 3.5-1.8 1.8 0 3 .9 3 2.2 0 1.5-1 2.1-2.2 2.8l-.3.2c-.7.6-1.2 1.2-1.3 2.1" />
          <path d="M12 17.2h.01" />
        </svg>
      </span>

      <div className="max-w-[260px]">
        <div className="rounded-[14px] bg-white px-3 py-2.5 text-[10.5px] leading-[1.45] text-[#1F2937] shadow-[0_1px_2px_rgba(0,0,0,0.07)] whitespace-pre-line">
          {message.text}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-placeholder">
          <span className="text-[8px]">{message.time}</span>
          <ActionIcon
            label={copied ? "Copied" : "Copy message"}
            onClick={copy}
            active={copied}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </ActionIcon>
          <ActionIcon label="Good response" active={like === "up"} onClick={() => setLike(like === "up" ? null : "up")}>
            <ThumbsUp size={11} />
          </ActionIcon>
          <ActionIcon label="Bad response" active={like === "down"} onClick={() => setLike(like === "down" ? null : "down")}>
            <ThumbsDown size={11} />
          </ActionIcon>
        </div>
      </div>
    </div>
  );
}