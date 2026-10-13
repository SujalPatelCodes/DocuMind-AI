import {
  Code2,
  CloudUpload,
  FileText,
  HelpCircle,
  LogOut,
  Settings,
  User,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { NavKey } from "../types";

interface NavItem {
  key: NavKey;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
}

const TOP_ITEMS: NavItem[] = [
  { key: "docs", label: "Documents", icon: FileText, badge: true },
  { key: "code", label: "Code", icon: Code2 },
  { key: "upload", label: "Upload", icon: CloudUpload },
  { key: "tools", label: "Tools", icon: Wrench },
];

const BOTTOM_ITEMS: NavItem[] = [
  { key: "help", label: "Help", icon: HelpCircle },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "profile", label: "Profile", icon: User },
  { key: "logout", label: "Log out", icon: LogOut },
];

interface Props {
  active: NavKey;
  onSelect: (key: NavKey) => void;
}

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (key: NavKey) => void;
}) {
  const Icon = item.icon;
  const activeCls = active
    ? "text-accent bg-white/[0.06]"
    : "text-[#9CA3AF] hover:bg-white/[0.06] hover:text-[#E5E7EB]";
  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(item.key)}
      className={`relative grid h-8 w-8 place-items-center rounded-lg transition-colors ${activeCls}`}
    >
      <Icon size={17} strokeWidth={1.9} />
      {/* small light-gray circular notification badge near the document icon */}
      {item.badge && (
        <span className="absolute right-[5px] top-[5px] h-[6px] w-[6px] rounded-full bg-[#D1D5DB]" />
      )}
    </button>
  );
}

/**
 * 56px black navigation sidebar (#050505). Yellow logo on top, primary icons,
 * then a spacer, then help/settings/profile/logout at the bottom. Icons are
 * 16–19px, muted gray, with yellow for the logo and the selected item.
 */
export default function NavigationSidebar({ active, onSelect }: Props) {
  return (
    <aside
      aria-label="Navigation"
      className="flex w-[56px] shrink-0 flex-col items-center bg-ink pt-[10px]"
    >
      {/* Yellow DocuMind AI logo */}
      <button
        type="button"
        title="DocuMind AI"
        aria-label="DocuMind AI logo"
        className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-ink transition-transform hover:scale-105"
      >
        <Zap size={18} strokeWidth={2.4} />
      </button>

      <div className="mt-4 flex flex-col items-center gap-1.5">
        {TOP_ITEMS.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={active === item.key}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="mb-3 flex flex-col items-center gap-1.5">
        {BOTTOM_ITEMS.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={active === item.key}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}