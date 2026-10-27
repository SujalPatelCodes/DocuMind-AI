import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import ChatMessageItem from "./ChatMessage";
import ChatInput from "./ChatInput";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

/**
 * Right chat panel: very light gray (#F8F8F8) background, vertically
 * arranged messages, with the input row anchored at the bottom.
 */
export default function ChatPanel({ messages, onSend }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  return (
    <section aria-label="Chat" className="flex min-w-0 flex-1 flex-col bg-canvas">
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-3 pt-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <p className="text-[12.5px] font-medium text-maintext">Start a new conversation</p>
            <p className="max-w-[240px] text-[11px] leading-relaxed text-placeholder">
              Ask any question about your document — the assistant will answer
              with references to the source pages.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageItem key={message.id} message={message} />
          ))
        )}
      </div>
      <ChatInput onSend={onSend} />
    </section>
  );
}