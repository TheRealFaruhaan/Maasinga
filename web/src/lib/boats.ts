// Boats that serve an island and where each one is right now.
//
// Mock until the API exists, but shaped like the API will be: per island, a
// list of services, each with the boat's current state. The mock runs every
// boat on a repeating timetable (wait at one end, sail, wait at the other,
// sail back), so states follow on from each other as time passes instead of
// jumping around.
import { DEFAULT_ISLAND_ID, getAtoll, getIsland, ISLANDS, type Island } from "./islands";
import { BOATS, rng, type Boat } from "./mock";
import { isMaleCity } from "./male";

export type ServiceState =
  | "docked_here" // in this island's harbour
  | "loading_here" // loading here, leaving soon
  | "arriving" // under 30 min out
  | "en_route_here" // on the way to this island
  | "away" // at the other end of the route
  | "loading_away" // loading at the other end, coming here next
  | "left"; // left this island, heading to the other end

export interface BoatService {
  boat: Boat;
  /** The other end of the route. */
  other: Island;
  state: ServiceState;
  /** Next departure from wherever the boat is (docked / loading states). */
  departs?: Date;
  /** Arrival at the end it's heading to (sailing states). */
  eta?: Date;
  /** What last happened, and what happens next, as seen from this island. */
  prev: { kind: "arrived" | "departed"; at: Date };
  next: { kind: "departs" | "arrives"; at: Date };
  /** 0–1 along the current leg (sailing states). */
  progress?: number;
  updatedAt: Date;
}

const H = 3_600_000;

function coords(i: Island): [number, number] {
  if (i.lat != null && i.lng != null) return [i.lat, i.lng];
  const a = getAtoll(i.atoll)!;
  return [a.lat, a.lng];
}

function km(a: Island, b: Island) {
  const [la1, ln1] = coords(a);
  const [la2, ln2] = coords(b);
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(ln2 - ln1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Islands we know the position of: roughly the atoll capitals. */
const HUBS = ISLANDS.filter((i) => i.lat != null && !isMaleCity(i));

export function boatsServing(island: Island, now: number): BoatService[] {
  const r = rng(island.id * 7919 + 17);
  const pool = BOATS.filter((b) => b.kind === "boat").concat(BOATS.filter((b) => b.kind === "launch"));
  const count = isMaleCity(island) ? 6 : 2 + Math.floor(r() * 3);
  const out: BoatService[] = [];

  for (let n = 0; n < count; n++) {
    const boat = pool[(Math.floor(r() * pool.length) + n) % pool.length];
    // Atoll islands run to Malé; boats into Malé come from atoll capitals.
    const other = isMaleCity(island)
      ? HUBS[Math.floor(r() * HUBS.length)]
      : getIsland(DEFAULT_ISLAND_ID)!;
    if (out.some((s) => s.boat.id === boat.id)) continue;

    const speed = boat.kind === "launch" ? 45 : 18; // km/h: speed launch vs dhoni
    const leg = Math.max(1, km(island, other) / speed) * H;
    const waitAway = (6 + r() * 18) * H;
    const waitHere = (2 + r() * 8) * H;
    const cycle = waitAway + leg + waitHere + leg;
    const t = (now + r() * cycle) % cycle;
    const start = now - t; // when this cycle began (boat docked at the other end)

    const loadAway = start + waitAway - 1.5 * H;
    const arriveHere = start + waitAway + leg;
    const leaveHere = arriveHere + waitHere;
    const loadHere = leaveHere - 1 * H;

    const leaveAway = start + waitAway;
    const D = (x: number) => new Date(x);
    let s: Omit<BoatService, "boat" | "other" | "updatedAt">;
    if (now < leaveAway) {
      // At the other end; comes here next.
      s = {
        state: now < loadAway ? "away" : "loading_away",
        departs: D(leaveAway),
        // It left here one leg before it reached the other end.
        prev: { kind: "departed", at: D(start - leg) },
        next: { kind: "arrives", at: D(arriveHere) },
      };
    } else if (now < arriveHere) {
      s = {
        state: arriveHere - now < 0.5 * H ? "arriving" : "en_route_here",
        eta: D(arriveHere),
        progress: (now - leaveAway) / leg,
        prev: { kind: "departed", at: D(leaveAway) },
        next: { kind: "arrives", at: D(arriveHere) },
      };
    } else if (now < leaveHere) {
      s = {
        state: now < loadHere ? "docked_here" : "loading_here",
        departs: D(leaveHere),
        prev: { kind: "arrived", at: D(arriveHere) },
        next: { kind: "departs", at: D(leaveHere) },
      };
    } else {
      // Left here; back after the turnaround at the other end.
      s = {
        state: "left",
        eta: D(leaveHere + leg),
        progress: (now - leaveHere) / leg,
        prev: { kind: "departed", at: D(leaveHere) },
        next: { kind: "arrives", at: D(leaveHere + cycle - waitHere) },
      };
    }

    // Timetables are in quarter hours.
    const q = (d?: Date) => (d ? new Date(Math.round(+d / (15 * 60_000)) * 15 * 60_000) : d);
    s.departs = q(s.departs);
    s.eta = q(s.eta);
    s.prev.at = q(s.prev.at)!;
    s.next.at = q(s.next.at)!;
    out.push({ boat, other, ...s, updatedAt: new Date(now - (2 + r() * 40) * 60_000) });
  }

  // Most relevant first: here now, then coming, then away.
  const rank: Record<ServiceState, number> = {
    loading_here: 0,
    docked_here: 1,
    arriving: 2,
    en_route_here: 3,
    loading_away: 4,
    away: 5,
    left: 6,
  };
  return out.sort((a, b) => rank[a.state] - rank[b.state]);
}

