"use client";

// Islands come from the API (/places?kind=island). Loaded once by
// <IslandsProvider>; after that the lookups below work synchronously.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, type Region } from "./api";

export interface Atoll {
  code: string;
  name_en: string;
  name_dv: string;
}

export interface Island {
  /** API place id, e.g. "K.Maafushi", "MLE.Male". */
  id: string;
  /** Short code shown big on cards. Interim: the atoll code; official island
   *  codes aren't in the API yet. */
  code: string;
  atoll: string;
  name_en: string;
  name_dv: string;
  lat: number;
  lng: number;
  pop: number | null;
  /** Boats that stopped here in August 2025. */
  boats: number;
  region: Region;
}

interface ApiPlace {
  id: string;
  kind: "island" | "site";
  name: string;
  atoll: string | null;
  lat: number;
  lon: number;
  pop: number | null;
  boats: number;
  region: Region;
  name_dv: string | null;
}

// Atolls north to south (Malé City before Kaafu). Dhivehi names are UI text,
// like the rest of the translations; English names come from the API.
const ATOLL_ORDER: [string, string][] = [
  ["HA", "ހއ"], ["HDh", "ހދ"], ["Sh", "ށ"], ["N", "ނ"], ["R", "ރ"], ["B", "ބ"], ["Lh", "ޅ"],
  ["MLE", "މާލެ ސިޓީ"], ["K", "ކ"], ["AA", "އއ"], ["ADh", "އދ"], ["V", "ވ"], ["M", "މ"], ["F", "ފ"],
  ["Dh", "ދ"], ["Th", "ތ"], ["L", "ލ"], ["GA", "ގއ"], ["GDh", "ގދ"], ["Gn", "ޏ"], ["S", "ސ"],
];

export const DEFAULT_ISLAND_ID = "MLE.Male";

let ISLANDS: Island[] = [];
let ATOLLS: Atoll[] = [];
const byId = new Map<string, Island>();
const atollByCode = new Map<string, Atoll>();

function load(places: ApiPlace[]) {
  const names = new Map<string, string>();
  ISLANDS = places
    .filter((p) => p.kind === "island")
    .map((p) => {
      const atoll = p.id.split(".")[0];
      if (p.atoll) names.set(atoll, p.atoll);
      return {
        id: p.id,
        code: atoll,
        atoll,
        name_en: p.name,
        name_dv: p.name_dv ?? p.name,
        lat: p.lat,
        lng: p.lon,
        pop: p.pop,
        boats: p.boats,
        region: p.region,
      };
    });
  ATOLLS = ATOLL_ORDER.filter(([code]) => names.has(code)).map(([code, dv]) => ({
    code,
    name_en: names.get(code)!,
    name_dv: dv,
  }));
  byId.clear();
  ISLANDS.forEach((i) => byId.set(i.id, i));
  atollByCode.clear();
  ATOLLS.forEach((a) => atollByCode.set(a.code, a));
}

export const getIsland = (id: string | null | undefined) => (id ? byId.get(id) : undefined);
export const getAtoll = (code: string) => atollByCode.get(code);

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Nearest island, or null when clearly outside the Maldives. */
export function nearestIsland(lat: number, lng: number): { island: Island; km: number } | null {
  let best: { island: Island; km: number } | null = null;
  for (const i of ISLANDS) {
    if (i.id === "MLE.Hulhule") continue; // the airport island isn't anyone's home
    const d = km(lat, lng, i.lat, i.lng);
    if (!best || d < best.km) best = { island: i, km: d };
  }
  return best && best.km <= 150 ? best : null;
}

type IslandsState = { status: "loading" | "error" | "ready"; islands: Island[]; atolls: Atoll[]; retry: () => void };
const Ctx = createContext<IslandsState>({ status: "loading", islands: [], atolls: [], retry: () => {} });

export function IslandsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "error" | "ready">(ISLANDS.length ? "ready" : "loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (ISLANDS.length) return;
    apiGet<ApiPlace[]>("/places?kind=island").then(
      (places) => {
        load(places);
        setState("ready");
      },
      () => setState("error"),
    );
  }, [attempt]);
  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };
  return <Ctx.Provider value={{ status: state, islands: ISLANDS, atolls: ATOLLS, retry }}>{children}</Ctx.Provider>;
}

export const useIslands = () => useContext(Ctx);
