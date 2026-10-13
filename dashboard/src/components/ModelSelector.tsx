import { Sparkles } from "lucide-react";
import type { ModelId } from "../types";
import type { ComponentType } from "react";

interface Props {
  model: ModelId;
  onModelChange: (model: ModelId) => void;
}

export interface ModelOption {
  id: ModelId;
  icon?: ComponentType<{ size?: number | string }>;
}

/**
 * Compact pill-shaped model selector on a pale gray (#F5F5F7) track.
 * The active option renders as a white pill with a subtle purple accent.
 */
export default function ModelSelector({ model, onModelChange }: Props) {
  const options: ModelId[] = ["llama3.2:3b"];

  return (
    <div
      role="radiogroup"
      aria-label="AI model"
      className="flex items-center gap-[2px] rounded-full bg-[#F5F5F7] p-[3px]"
    >
      {options.map((id) => {
        const active = id === model;
        const Accent = active ? Sparkles : undefined;
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
          >
            {Accent && <Accent size={10} className="text-modaccent" />}
            {id}
          </button>
        );
      })}
    </div>
  );
}