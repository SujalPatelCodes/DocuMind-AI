import { useState } from "react";
import { Send } from "lucide-react";

interface Props {
  onSend: (text: string) => void;
}

/**
 * Bottom chat input row: yellow assistant action icon, white pill input
 * (“Ask any question about your document”) and a pale gray send button.
 * Enter or the send icon posts the message.
 */
export default function ChatInput({ onSend }: Props) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };

  return (
    <div className="shrink-0 bg-canvas px-3 pb-3 pt-1.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-accent text-ink"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 9.5c.6-1.1 1.9-1.8 3.5-1.8 1.8 0 3 .9 3 2.2 0 1.5-1 2.1-2.2 2.8l-.3.2c-.7.6-1.2 1.2-1.3 2.1" />
            <path d="M12 17.2h.01" />
          </svg>
        </span>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Ask any question about your document"
          aria-label="Ask any question about your document"
          className="h-8 min-w-0 flex-1 rounded-full border border-line bg-white px-3.5 text-[10.5px] text-maintext placeholder-placeholder focus:border-[#cfd2d8] focus:outline-none"
        />

        <button
          type="button"
          aria-label="Send message"
          title="Send"
          onClick={submit}
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-light text-subtext transition-colors hover:bg-[#E9EAEC] hover:text-maintext"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}