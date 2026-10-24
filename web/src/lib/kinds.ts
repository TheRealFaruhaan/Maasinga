/** What the traveller picked: launch (speedboat) or boat (dhoni / slow boat). */
export type FerryKind = "launch" | "boat";

/** Quick contact tabs. */
export type ContactKind = "cargo" | "speedboat" | "ferry" | "shop";
export interface Contact {
  name: string;
  phone: string;
}

/** A stable colour per boat code, so the same boat looks the same everywhere. */
const PALETTE = ["#B5463F", "#2BA58F", "#2E8BD8", "#C98A1B", "#7A4FC2", "#1E9BB0", "#D0563B", "#3A57E8", "#2F8F5B"];
export function boatColor(code: string) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
