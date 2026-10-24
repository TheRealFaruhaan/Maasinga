"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { IslandList, type IslandListProps } from "./island-list";

interface Props extends Omit<IslandListProps, "className"> {
  open: boolean;
  title: string;
  onClose: () => void;
}

/** Bottom sheet holding the island list (used for To). */
export function IslandSheet({ open, title, onClose, ...list }: Props) {
  const { t } = useLang();
  // A new list per opening, so the search clears; kept mounted while closing
  // so the slide-out animation still has content.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 transition ${open ? "visible" : "invisible"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-[#0b1a66]/60 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] max-w-md flex-col rounded-t-[28px] bg-white text-brand-ink shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-brand-ink/15" />
        <div className="flex items-center justify-between px-5 pb-3 pt-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="grid size-9 place-items-center rounded-full bg-brand-ink/5 text-brand-ink/70"
          >
            <X className="size-4" />
          </button>
        </div>
        {session > 0 && (
          <IslandList key={session} {...list} className="flex-1 pb-[max(env(safe-area-inset-bottom),16px)]" />
        )}
      </div>
    </div>
  );
}
