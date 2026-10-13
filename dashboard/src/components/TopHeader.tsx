import { FileText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { ModelId } from "../types";
import ModelSelector from "./ModelSelector";

interface Props {
  model: ModelId;
  onModelChange: (model: ModelId) => void;
  onAddDocument: () => void;
}

function PillButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-[22px] items-center gap-1 rounded-full border border-line bg-white px-2 text-[9px] text-maintext transition-colors hover:bg-light"
    >
      {children}
    </button>
  );
}

/**
 * 43px white workspace header: assistant branding on the left, the model
 * selector in the middle, and language / credit / buy / documents on the right.
 */
export default function TopHeader({ model, onModelChange, onAddDocument }: Props) {
  return (
    <header className="relative flex h-[43px] shrink-0 items-center gap-2.5 border-b border-line bg-white px-3">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ink text-white">
          <Sparkles size={13} />
        </span>
        <span className="text-[11px] font-semibold tracking-tight text-maintext">
          DocuMind
        </span>
        <span className="ml-0.5 h-[6px] w-[6px] rounded-full bg-status" />
        <span className="text-[10px] text-subtext">AI</span>
      </div>

      {/* Model selector — centered in the remaining width */}
      <div className="flex min-w-0 flex-1 justify-center">
        <ModelSelector model={model} onModelChange={onModelChange} />
      </div>

      {/* Right-side controls */}
      <div className="flex shrink-0 items-center gap-1.5">
        <PillButton label="Documents" onClick={onAddDocument}>
          <FileText size={11} />
          Documents
        </PillButton>
      </div>
    </header>
  );
}