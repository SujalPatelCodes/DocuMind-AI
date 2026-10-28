import { Cpu, Sparkles } from "lucide-react";
import type { ModelId } from "../types";

interface Props {
  model: ModelId;
  onModelChange: (model: ModelId) => void;
}

const MODELS: ModelId[] = ["llama3.2:3b", "qwen3.5:9b", "qwen2.5vl:3b"];

/**
 * Compact pill-shaped model selector on a pale gray (#F5F5F7) track.
 * The active option renders as a white pill with a subtle purple accent.
 */
export default function ModelSelector({ model, onModelChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="AI model"
      className="flex items-center gap-[2px] rounded-full bg-[#F5F5F7] p-[3px]"
    >
      {MODELS.map((id) => {
        const active = id === model;
        const Accent = active ? Sparkles : Cpu;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onModelChange(id)}
            className={`flex items-center gap-1 rounded-full whitespace-nowrap text-[9px] transition-colors ${
              active
                ? "bg-white px-2 py-[4px] font-medium text-maintext shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                : "px-2 py-[4px] text-subtext hover:text-maintext"
            }`}
            title={`Use ${id}`}
          >
            <Accent size={10} className={active ? "text-modaccent" : "text-placeholder"} />
            {id}
          </button>
        );
      })}
    </div>
  );
}