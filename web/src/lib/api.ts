// Maasinga API client. Reference: crundi_attachments/…Maasinga_API.md
// (base URL, conventions, response shapes). Boat data is August 2025
// history; only /forecast is live.
"use client";

import { useEffect, useState } from "react";

export const API_BASE = process.env.NEXT_PUBLIC_MAASINGA_API ?? "https://maasinga-api.devoup.com";

export type PlaceId = string;
export type BoatCode = string;
export type BoatType = "fast" | "dhoni" | "slow";
export type Region = "north" | "central" | "midsouth" | "south";

export interface SlotBoat {
  code: BoatCode;
  name: string;
  type: BoatType;
  days: number;
}

export interface ScheduleItem {
  departs: string;
  arrives: string;
  from_id: PlaceId;
  from_name: string;
  to_id: PlaceId;
  to_name: string;
  days: number;
  median_min: number;
  main_type: BoatType;
  boats: SlotBoat[];
}
export interface Schedule {
  place: PlaceId;
  departures: ScheduleItem[];
  arrivals: ScheduleItem[];
}

export interface ViaConnection {
  via_id: PlaceId;
  via_name: string;
  first_trips: number;
  second_trips: number;
  first_min: number;
  second_min: number;
  first_type: BoatType;
  second_type: BoatType;
}

export interface RouteDetail {
  /** false: under 20 trips in August; real trips and boats, no usual departures. */
  listed: boolean;
  boats_count?: number;
  /** Connections with one stop. */
  via: ViaConnection[];
  from_id: PlaceId;
  to_id: PlaceId;
  from_name: string;
  to_name: string;
  trips: number;
  median_min: number;
  late_pct: number | null;
  main_type: BoatType;
  departures: { time: string; arrives: string; days: number; boats: SlotBoat[] }[];
  hours: number[];
  boats: {
    boat_code: BoatCode;
    boat_name: string | null;
    boat_type: BoatType;
    boat_kind: string | null;
    trips: number;
    median_min: number;
    last_seen: string;
  }[];
  path: number[];
}

export type Confidence = "very likely" | "likely" | "possible";

/** One predicted departure (/predict/...). */
export interface PredictedDeparture {
  departs: string;
  arrives: string;
  from_id: PlaceId;
  from_name: string;
  to_id: PlaceId;
  to_name: string;
  probability: number;
  confidence: Confidence;
  minutes: number;
  runs_on: string[];
  boats: SlotBoat[];
}

export interface PredictedDay {
  date: string; // YYYY-MM-DD
  weekday: string;
  sea: { d: string; wave: number; loss_pct: number; rating: "calm" | "choppy" | "rough" } | null;
  departures: PredictedDeparture[];
  arrivals?: PredictedDeparture[];
}

export interface Prediction {
  days: PredictedDay[];
}

export interface PlaceContacts {
  place: PlaceId;
  /** true while names are made up and numbers are placeholders. */
  demo: boolean;
  contacts: Partial<Record<"cargo" | "speedboat" | "ferry" | "shop", { name: string; phone: string }[]>>;
}

/** Predicted departures from now on, in order, each with its Date. */
export function upcomingPredicted(days: PredictedDay[], now = new Date()): (PredictedDeparture & { date: Date; day: PredictedDay })[] {
  const out: (PredictedDeparture & { date: Date; day: PredictedDay })[] = [];
  for (const day of days) {
    for (const d of day.departures) {
      const date = new Date(`${day.date}T${d.departs}:00`);
      if (date.getTime() >= now.getTime() - 5 * 60_000) out.push({ ...d, date, day });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface Hotline {
  id: string;
  category: "emergency" | "transport" | string;
  number: string;
  name: { en: string; dv: string };
}

export interface BusRoute {
  code: string;
  from: { en: string; dv: string };
  to: { en: string; dv: string };
  fare: string | null;
  every_min: number | null;
  hours: string | null;
  color: string;
  /** Has passenger figures in /bus-ridership. */
  ridership: boolean;
}

export interface BusRidership {
  /** true: figures are randomly generated (organiser's sample file). */
  sample: boolean;
  note: string;
  period: "month" | "day";
  rows: { at: string; route: string; paid: number; foc: number; total: number }[];
}

export interface AirportFare {
  to: { en: string; dv: string };
  place_id: PlaceId;
  car: string;
  van: string;
}

export interface PlaceDetail {
  id: PlaceId;
  name: string;
  boats_based: { code: BoatCode; name: string; type: BoatType; kind: string | null; operator: string | null; trips: number }[];
  sea_region: { region: Region; name: string; rough_wave: number } | null;
}

export interface Forecast {
  region: Region;
  name: string;
  calm_wave: number;
  source: string;
  days: { d: string; wave: number; loss_pct: number; rating: "calm" | "choppy" | "rough" }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Responses are cached for the page's lifetime: August data never changes,
// and the forecast is cached for 30 minutes by the API itself.
const cache = new Map<string, Promise<unknown>>();

export function apiGet<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    const once = () =>
      fetch(API_BASE + path).then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { detail?: string } | null;
          throw new ApiError(r.status, body?.detail ?? String(r.status));
        }
        return r.json() as Promise<T>;
      });
    // One retry after a moment for network errors and 5xx (the API or its
    // proxy blipping); 4xx answers are real and returned as they are.
    p = once().catch((e: Error) => {
      if (e instanceof ApiError && e.status < 500) throw e;
      return new Promise<T>((resolve, reject) => setTimeout(() => once().then(resolve, reject), 1500));
    });
    // Don't keep failures: the next render may retry.
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export type ApiState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: ApiError | Error };

/** Fetch `path` (null = nothing to fetch). Re-fetches when the path changes. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [state, setState] = useState<{ path: string | null; s: ApiState<T> }>({ path: null, s: { status: "idle" } });
  useEffect(() => {
    if (!path) return;
    let live = true;
    apiGet<T>(path).then(
      (data) => live && setState({ path, s: { status: "ok", data } }),
      (error: Error) => live && setState({ path, s: { status: "error", error } }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  if (!path) return { status: "idle" };
  return state.path === path ? state.s : { status: "loading" };
}

/** Next departures in time order, starting from now, wrapping into tomorrow. */
export function upcoming<T extends { time: string }>(items: T[], now = new Date()): (T & { tomorrow: boolean })[] {
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));
  const later = sorted.filter((x) => x.time >= hm).map((x) => ({ ...x, tomorrow: false }));
  const next = sorted.filter((x) => x.time < hm).map((x) => ({ ...x, tomorrow: true }));
  return [...later, ...next];
}

/** Launch = speedboat/launch; boat = dhoni/ferry or slow boat. */
export const isLaunch = (t: BoatType) => t === "fast";
