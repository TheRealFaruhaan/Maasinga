"use client";

import { ChevronDown, Package, Ship } from "lucide-react";
import { useLang } from "@/lib/i18n";
import type { Island } from "@/lib/islands";

export type Intent = "travel" | "cargo";

const OPTIONS: { id: Intent; Icon: typeof Ship; tint: string }[] = [
  { id: "travel", Icon: Ship, tint: "#2BA58F" },
  { id: "cargo", Icon: Package, tint: "#C98A1B" },
];

interface Props {
  from: Island | undefined;
  active: Intent | null;
  onToggle: (i: Intent) => void;
  /** What a card reveals when opened. */
  renderPanel: (i: Intent) => React.ReactNode;
}

/**
 * What the person wants to do. Each choice is a card that opens in place to
 * reveal its tools (one open at a time); nothing navigates away.
 */
export function IntentPicker({ from, active, onToggle, renderPanel }: Props) {
  const { t, lang } = useLang();
  const fromName = from ? (lang === "dv" ? from.name_dv : from.name_en) : "";
  return (
    <section className="pt-7">
      <h1 className="text-[28px] font-bold leading-tight text-white">{t.intentTitle}</h1>
      <div className="mt-5 space-y-3">
        {OPTIONS.map(({ id, Icon, tint }) => {
          const open = active === id;
          return (
            <div key={id}>
              <button
                onClick={() => onToggle(id)}
                aria-expanded={open}
                aria-controls={`intent-${id}`}
                className={`flex w-full items-center gap-4 rounded-[26px] bg-white p-4 text-start text-brand-ink shadow-[0_18px_40px_-18px_rgba(5,20,90,0.6)] transition-transform duration-300 active:scale-[0.985]`}
              >
                <span
                  className="grid size-13 shrink-0 place-items-center rounded-[17px] text-white"
                  style={{ background: tint }}
                >
                  <Icon className="size-7" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold leading-snug">{t.intents[id].title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-brand-ink/55">
                    {t.intents[id].sub(fromName)}
                  </span>
                </span>
                <ChevronDown
                  className={`size-5 shrink-0 text-brand-ink/30 transition-transform duration-500 ease-[cubic-bezier(.3,1.5,.5,1)] ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* grid-rows 0fr → 1fr animates to the content's real height. */}
              <div
                id={`intent-${id}`}
                className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.9,.25,1)] ${
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
                inert={!open}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={`pb-2 pt-4 transition-[opacity,transform] duration-400 ease-[cubic-bezier(.3,1.3,.5,1)] ${
                      open ? "translate-y-0 opacity-100 delay-75" : "-translate-y-3 opacity-0"
                    }`}
                  >
                    {renderPanel(id)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
