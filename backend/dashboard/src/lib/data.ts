"use client";

import { useEffect, useState } from "react";
import { API, logout, token } from "./auth";

// Shapes of the data files the Python pipeline writes to data/out (served by the API).

export type RegionKey = "north" | "central" | "midsouth" | "south";

export interface SeaRegionFit {
  name: string;
  lat: number;
  lon: number;
  points?: [number, number][]; // weather points of the region ([lat, lon]); the forecast takes the worst of them
  r_daily: number;
  slope: number;
  intercept: number;
  r_gust: number;
  days: number;
  r_hourly: number;
  hours: number;
}

export interface SeaDayRegion {
  idx: number;
  kn: number;
  boats: number;
  wave: number;
  gust: number;
  rain: number;
  rough: boolean;
}

export interface SeaData {
  sensors: number;
  regions: Record<RegionKey, SeaRegionFit>;
  pooled: { r: number; slope: number; intercept: number; n: number };
  roughWave: Record<RegionKey, number>;
  days: { d: string; r: Record<RegionKey, SeaDayRegion> }[];
  cells: Record<string, [number, number, number, number][]>; // lon, lat, idx, boats
}

export interface Place {
  id: string;
  kind: "island" | "site";
  lat: number;
  lon: number;
  boats: number;
  name: string;
  atoll: string | null;
  pop: number | null;
}

export interface Route {
  from: string;
  to: string;
  n: number;
  boats: number;
  mins: number;
  latePct: number | null;
  cls: "fast" | "dhoni" | "slow";
  usual: [string, number][]; // time and the number of August days it ran on
  hours: number[];
}

export interface IndexRow {
  code: string;
  island: string;
  atoll: string;
  pop: number;
  depWeek: number;
  boats: number;
  dests: number;
  index: number;
}

export interface NetworkData {
  places: Place[];
  routes: Route[];
  index: IndexRow[];
  daily: { d: string; n: number; islands: number }[];
  totals: { trips: number; boats: number; days: number; population: number };
}

export interface SafetyData {
  summary: { rough: boolean; days: number; trips: number; crossings: number; nightCrossings: number; fastCrossings: number }[];
  days: { d: string; trips: number; crossings: number; roughCrossings: number; nightCrossings: number }[];
  roughRoutes: { from: string; to: string; region: RegionKey; n: number; days: number; night: number; maxWave: number; path: [number, number][] }[];
  crossingRates: { rough: boolean; regionDays: number; crossings: number; perDay: number }[];
  fullSpeed: {
    split: { rough: boolean; boatDays: number; fullSpeed: number; pct: number }[];
    boats: { id: string; region: RegionKey; roughDays: number; idx: number; maxWave: number }[];
  };
  seaStops: { split: { rough: boolean; days: number; n: number; perDay: number }[]; corrWave: number | null };
}

export interface SignalData {
  cells: [number, number, number, number, number][]; // lon, lat, late %, pings, boats
  zones: { name: string; cells: number; km: number; boats: number; latePct: number; lon: number; lat: number }[];
  worst: { lat: number; lon: number; pct: number; boats: number; near: string; atoll: string; km: number }[];
  total: { pings: number; latePct: number; cells: number; deadCells: number };
}

export interface TaxiData {
  days: number;
  hourly: { h: number; n: number; expired: number; airportN: number; airportExpired: number; arrPax: number; arrFlights: number }[];
  zones: { zone: string; n: number; pct: number; expired: number }[];
  lostMvr: number;
  expired: number;
  grid: { dow: number; h: number; n: number; pct: number }[];
  corrAirportArrivals: number;
  total: [number, number];
}

export interface ReplayData {
  day: string;
  label: "calm" | "rough";
  boats: number;
  wave: number;
  segments: { c: 0 | 1 | 2; t: number[]; p: number[] }[];
}

export type GeoJSON = { type: "FeatureCollection"; features: { type: "Feature"; geometry: unknown; properties: Record<string, unknown> }[] };

const cache = new Map<string, Promise<unknown>>();

// All data comes from the Maasinga API (api/ folder). Most routes need a login (see lib/auth.ts).

// Data file name to API endpoint.
const ENDPOINT: Record<string, string> = {
  "network.json": "/network",
  "paths.json": "/paths",
  "route-boats.json": "/route-boats",
  "sea.json": "/sea",
  "safety.json": "/safety",
  "signal.json": "/signal",
  "harbour.json": "/harbour",
  "boat-names.json": "/boat-names",
  "replay-calm.json": "/replay/calm",
  "replay-rough.json": "/replay/rough",
  "land.json": "/map/land",
  "reefs.json": "/map/reefs",
};

function get(url: string) {
  const t = token();
  return fetch(url, { headers: t ? { Authorization: `Bearer ${t}` } : {} }).then((r) => {
    // An expired or revoked login: back to the login screen.
    if (r.status === 401) logout();
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  });
}

export function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    // A file name maps to its dataset endpoint; a name that starts with "/" is an API path.
    const path = name.startsWith("/") ? name : ENDPOINT[name];
    const p = API && path ? get(`${API}${path}`) : Promise.reject(new Error(`No API for ${name}`));
    // A failed load is not kept, so it is tried again after the next login.
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return cache.get(name) as Promise<T>;
}

/** Load one static data file. Returns undefined while loading and an Error if it failed. */
/** Display name for a coded boat (demo: best-guess names from the team's list); the code if there is none. */
export function useBoatName() {
  const names = useData<Record<string, string>>("boat-names.json");
  return (code: string) => (names && !(names instanceof Error) && names[code]) || code;
}

export function useData<T>(name: string): T | Error | undefined {
  const [data, setData] = useState<T | Error | undefined>(undefined);
  useEffect(() => {
    let live = true;
    load<T>(name).then(
      (d) => live && setData(d),
      (e: Error) => live && setData(e),
    );
    return () => {
      live = false;
    };
  }, [name]);
  return data;
}

export const fmt = new Intl.NumberFormat("en-US");
export const fmt1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmt2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const REGION_ORDER: RegionKey[] = ["north", "central", "midsouth", "south"];

export function shortDate(d: string) {
  const [, m, day] = d.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(day)}\u00a0${months[Number(m) - 1]}`;
}

export const REGION_NAME: Record<RegionKey, string> = {
  north: "North",
  central: "Male and Ari",
  midsouth: "Mid south",
  south: "Huvadhu and Addu",
};

export interface HarbourBoat {
  id: string;
  type: "fast" | "dhoni" | "slow";
  stays: number;
  tripsIn: number;
  tripsAug: number;
  medianMin: number;
  longestMin: number;
  hours: number;
  days: number;
  dayList: number[];
  origins: [string, number][];
}

export interface HarbourData {
  polygon: [number, number][];
  boats: HarbourBoat[];
  entered: number;
  origins: { id: string; name: string; lat: number; lon: number; n: number }[];
  hours: number[];
  days: { d: string; boats: number }[];
}

/** One North Harbour boat over August (API /harbour/boats/{code}/timeline). Times are Maldives local time. */
export interface HarbourTimeline {
  code: string;
  name: string | null;
  type: "fast" | "dhoni" | "slow" | null;
  t0: string;
  step_min: number;
  km: (number | null)[];
  stops: { arr: string; dep: string; place: string | null; name: string | null; male: boolean; harbour: boolean; km: number; minutes: number }[];
  trips: { left: string; back: string; hours: number; calls: string[]; furthest: string | null; furthest_km: number | null }[];
  projection: null | {
    from: "in Male" | "away";
    leaves: string | null;
    back: string;
    median_stay_in_male_h: number;
    median_trip_h: number;
    based_on_trips: number;
    today?: { leaves: string; back: string; note: string };
  };
  places: Record<string, { id: string; name: string; lat: number; lon: number }>;
}

/** Display a number string with a true minus sign (U+2212), so "-0.89" does not read as a dash. */
export function minus(s: string) {
  return s.replace(/^-/, "−");
}
