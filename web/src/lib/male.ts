// Greater Malé public transport (MTCC / RTL). Sources, checked Oct 2026:
// - maldivesairport.com/transport/taxi-bus (airport routes, fares, hours, taxi fares)
// - mtcc.mv R1/R2 Malé–Hulhumalé route map
// - see.mv/78868 (R5, Hulhumalé Phase 1 internal)
// - raajje.mv/129111 (R10–R12 Malé city routes)
// Routes change (road works, Ramadan); the RTL app has the live timetable.
import type { Island } from "./islands";

export interface BusRoute {
  code: string;
  from: { en: string; dv: string };
  to: { en: string; dv: string };
  fare?: string;
  every?: number; // minutes
  hours?: string;
  color: string;
}

const P = (en: string, dv: string) => ({ en, dv });
const MALE = P("Malé · West Park", "މާލެ · ވެސްޓް ޕާކް");
const CARNIVAL = P("Malé · Carnival", "މާލެ · ކާނިވަލް");
const HM1 = P("Hulhumalé Phase 1", "ހުޅުމާލެ ފޭސް 1");
const HM2 = P("Hulhumalé Phase 2", "ހުޅުމާލެ ފޭސް 2");
const AIRPORT = P("Velana Airport", "ވެލާނާ އެއާޕޯޓު");

export const BUS_ROUTES: BusRoute[] = [
  { code: "R1", from: MALE, to: HM1, color: "#2E8BD8" },
  { code: "R2", from: CARNIVAL, to: HM1, color: "#2BA58F" },
  { code: "R3", from: MALE, to: AIRPORT, fare: "MVR 10", every: 60, hours: "06:40–00:40", color: "#C2413B" },
  { code: "R4", from: HM1, to: AIRPORT, fare: "MVR 10", every: 30, hours: "06:00–00:30", color: "#C98A1B" },
  { code: "R5", from: HM1, to: P("Phase 1 loop", "ފޭސް 1 ތެރެއިން"), color: "#7A4FC2" },
  { code: "R9", from: HM2, to: AIRPORT, fare: "MVR 15", every: 30, hours: "06:00–00:30", color: "#D0563B" },
  { code: "R10", from: P("Malé city", "މާލެ ސިޓީ"), to: P("Orchid Magu", "އޯކިޑް މަގު"), color: "#1E9BB0" },
  { code: "R11", from: P("Malé city", "މާލެ ސިޓީ"), to: P("Ameenee Magu", "އަމީނީ މަގު"), color: "#3A57E8" },
  { code: "R12", from: P("Malé city", "މާލެ ސިޓީ"), to: P("Sosun Magu", "ސޮސުން މަގު"), color: "#2BA58F" },
];

/** Fixed airport taxi fares, standard car (under 6 seats) / 7–10 seats. */
export const AIRPORT_TAXI = [
  { to: P("Malé", "މާލެ"), car: "MVR 70", van: "MVR 110" },
  { to: HM1, car: "MVR 80", van: "MVR 125" },
  { to: HM2, car: "MVR 85", van: "MVR 130" },
];

const MALE_CITY = new Set(["Male", "Hulhumale", "Villimale"]);
export const isMaleCity = (i: Island | undefined) => !!i && i.atoll === "K" && MALE_CITY.has(i.name_en);
