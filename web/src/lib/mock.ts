// Mock data until the API exists. Deterministic per route so the page
// doesn't reshuffle on every render.
import type { Island } from "./islands";

export type FerryKind = "launch" | "boat";

export interface Boat {
  id: string;
  name_en: string;
  name_dv: string;
  color: string;
  kind: FerryKind;
}

export const BOATS: Boat[] = [
  { id: "ulhiashi", name_en: "Ulhiashi", name_dv: "އުލިއަށި", color: "#B5463F", kind: "boat" },
  { id: "sazee4", name_en: "Sazee 4", name_dv: "ސާޒީ 4", color: "#2BA58F", kind: "boat" },
  { id: "furamaa", name_en: "Furamaa", name_dv: "ފުރަމާ", color: "#2E8BD8", kind: "boat" },
  { id: "dhonfulhu", name_en: "Dhonfulhu", name_dv: "ދޮންފުޅު", color: "#C98A1B", kind: "boat" },
  { id: "kaneeru", name_en: "Kaneeru", name_dv: "ކަނީރު", color: "#7A4FC2", kind: "launch" },
  { id: "raalhu", name_en: "Raalhu", name_dv: "ރާޅު", color: "#1E9BB0", kind: "launch" },
  { id: "hiyaa", name_en: "Hiyaa", name_dv: "ހިޔާ", color: "#D0563B", kind: "launch" },
];

export interface Trip {
  id: string;
  boat: Boat;
  date: Date;
  time: string;
  location: { en: string; dv: string };
  updated: boolean;
}

export interface BoatInArea {
  boat: Boat;
  arrived: Date;
  departure: Date | null;
  status: BoatStatus;
}

const LOCATIONS = [
  { en: "NH - Beyruthoshi", dv: "އުތުރު ބަނދަރު - ބޭރުތޮށި" },
  { en: "NH - Jetty 3", dv: "އުތުރު ބަނދަރު - ޖެޓީ 3" },
  { en: "Ferry Terminal", dv: "ފެރީ ޓާރމިނަލް" },
  { en: "Harbour - East", dv: "ބަނދަރު - އިރުމަތި" },
];
export type BoatStatus = "notNear" | "northHarbour" | "loading" | "atHarbour";
const STATUSES: BoatStatus[] = ["notNear", "northHarbour", "loading", "atHarbour"];
const TIMES = ["07:30", "10:00", "14:00", "16:30", "21:00"];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function tripsFor(from: Island, to: Island, kind: FerryKind, today = new Date()): Trip[] {
  const r = rng(from.id * 1000 + to.id + (kind === "launch" ? 7 : 0));
  const pool = BOATS.filter((b) => b.kind === kind);
  const n = 2 + Math.floor(r() * 3);
  const trips: Trip[] = [];
  for (let i = 0; i < n; i++) {
    trips.push({
      id: `${from.id}-${to.id}-${kind}-${i}`,
      boat: pool[Math.floor(r() * pool.length)],
      date: addDays(today, Math.floor(i / 2) + Math.floor(r() * 2)),
      time: TIMES[Math.floor(r() * TIMES.length)],
      location: LOCATIONS[Math.floor(r() * LOCATIONS.length)],
      updated: r() < 0.35,
    });
  }
  return trips.sort((a, b) => +a.date - +b.date || a.time.localeCompare(b.time));
}

export function boatsInArea(island: Island, kind: FerryKind, today = new Date()): BoatInArea[] {
  const r = rng(island.id * 31 + (kind === "launch" ? 3 : 0));
  const pool = BOATS.filter((b) => b.kind === kind);
  const n = 1 + Math.floor(r() * pool.length);
  return pool.slice(0, n).map((boat) => ({
    boat,
    arrived: addDays(today, -Math.floor(r() * 5)),
    departure: r() < 0.4 ? addDays(today, 1 + Math.floor(r() * 3)) : null,
    status: STATUSES[Math.floor(r() * STATUSES.length)],
  }));
}

export type ContactKind = "cargo" | "speedboat" | "ferry" | "shop";

export const CONTACTS: Record<ContactKind, { name: string; phone: string }[]> = {
  cargo: [
    { name: "Ferien", phone: "7512345" },
    { name: "Zillion", phone: "7723456" },
    { name: "Hulhu Cargo", phone: "9634567" },
    { name: "Bodu Logistics", phone: "7745678" },
  ],
  speedboat: [
    { name: "Blue Wave", phone: "7781234" },
    { name: "Atoll Express", phone: "9912345" },
  ],
  ferry: [
    { name: "MTCC Ferry", phone: "1650" },
    { name: "Ulhiashi Dhoni", phone: "7798765" },
    { name: "Sazee Transport", phone: "9987654" },
  ],
  shop: [
    { name: "Harbour Mart", phone: "3301234" },
    { name: "Jetty Hardware", phone: "7654321" },
  ],
};

