// The person's choices, remembered in this browser (localStorage).
// One versioned entry, so the shape can change later without stale junk.
import type { ContactKind, FerryKind } from "./kinds";

export interface Prefs {
  lang?: "en" | "dv";
  /** Island they picked by hand (API place id); GPS doesn't override it. */
  fromId?: string;
  toId?: string;
  ferryKind?: FerryKind;
  /** Which "what would you like to do" card was open. */
  intent?: "travel" | "cargo" | null;
  contactTab?: Partial<Record<string, ContactKind>>;
  /** Quick contact: your island's contacts, or the destination's. */
  contactSide?: "here" | "dest";
}

const KEY = "maasinga:prefs:v1";
const OLD = { lang: "maasinga_lang", to: "maasinga_to" };

export function loadPrefs(): Prefs {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Prefs;
      // Island ids were numbers before islands came from the API; drop those.
      if (typeof p.fromId !== "string") delete p.fromId;
      if (typeof p.toId !== "string") delete p.toId;
      return p;
    }
    // Carry over the keys used before prefs were grouped.
    const p: Prefs = {};
    const lang = localStorage.getItem(OLD.lang);
    if (lang === "en" || lang === "dv") p.lang = lang;
    localStorage.removeItem(OLD.lang);
    localStorage.removeItem(OLD.to);
    if (Object.keys(p).length) localStorage.setItem(KEY, JSON.stringify(p));
    return p;
  } catch {
    return {};
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  if (typeof localStorage === "undefined") return;
  try {
    const next = { ...loadPrefs(), ...patch };
    for (const k of Object.keys(next) as (keyof Prefs)[]) if (next[k] === undefined) delete next[k];
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage full: choices just won't stick.
  }
}

export function clearPref(key: keyof Prefs) {
  savePrefs({ [key]: undefined });
}
