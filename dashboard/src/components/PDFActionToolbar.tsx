import type { PdfAction } from "../types";

const ACTIONS: PdfAction[] = ["Explain", "Summarise", "Rewrite"];

interface Props {
  onAction: (action: PdfAction) => void;
}

/**
 * Small floating toolbar overlaying the upper-middle of the PDF page:
 * three compact white buttons (Explain / Summarise / Rewrite).
 */
export default function PDFActionToolbar({ onAction }: Props) {
  return (
    <div className="absolute left-1/2 top-[42px] z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      {ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action)}
          className="rounded-md px-2.5 py-[3px] text-[9px] text-[#374151] transition-colors hover:bg-light hover:text-maintext"
        >
          {action}
        </button>
      ))}
    </div>
  );
}