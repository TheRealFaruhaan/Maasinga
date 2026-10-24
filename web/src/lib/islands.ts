import data from "@/data/islands.json";

export interface Atoll {
  code: string;
  name_en: string;
  name_dv: string;
  lat: number;
  lng: number;
}

export interface Island {
  id: number;
  /** Island code: atoll letter + number, e.g. "T1" (Malé), "C7". Numbers are mock. */
  code: string;
  atoll: string;
  name_en: string;
  name_dv: string;
  /** Only set for islands whose position we know; used for "nearest island". */
  lat?: number;
  lng?: number;
}

export const ATOLLS: Atoll[] = data.atolls;
export const ISLANDS: Island[] = data.islands;

const byId = new Map(ISLANDS.map((i) => [i.id, i]));
const atollByCode = new Map(ATOLLS.map((a) => [a.code, a]));

export const getIsland = (id: number | null | undefined) =>
  id == null ? undefined : byId.get(id);
export const getAtoll = (code: string) => atollByCode.get(code);

/** "K. Male" — the short form Maldivians use for an island. */
export const islandLabel = (i: Island, lang: "en" | "dv" = "en") =>
  lang === "dv" ? `${getAtoll(i.atoll)?.name_dv ?? ""}. ${i.name_dv}` : `${i.atoll}. ${i.name_en}`;

export const DEFAULT_ISLAND_ID =
  ISLANDS.find((i) => i.atoll === "K" && i.name_en === "Male")?.id ?? ISLANDS[0].id;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Nearest island with known coordinates. Returns null when the point is
 * clearly outside the Maldives, so callers can fall back to a default.
 */
export function nearestIsland(lat: number, lng: number): { island: Island; km: number } | null {
  let best: { island: Island; km: number } | null = null;
  for (const i of ISLANDS) {
    if (i.lat == null || i.lng == null) continue;
    const d = km(lat, lng, i.lat, i.lng);
    if (!best || d < best.km) best = { island: i, km: d };
  }
  return best && best.km <= 150 ? best : null;
}
