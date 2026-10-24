"use client";

import { loadPrefs, savePrefs } from "./prefs";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "dv";

// Dhivehi strings are a first pass — have a native speaker review before launch.
const STRINGS = {
  en: {
    boatsServing: (island: string) => `Boats serving ${island}`,
    serviceState: {
      docked_here: () => "In harbour",
      loading_here: () => "Loading",
      arriving: () => "Arriving",
      en_route_here: () => "On the way",
      loading_away: (other: string) => `Loading at ${other}`,
      away: (other: string) => `At ${other}`,
      left: (other: string) => `To ${other}`,
    },
    movement: { arrived: "Arrived", departed: "Departed", departs: "Departure", arrives: "Arrives" },
    updatedAgo: (m: number) => (m < 60 ? `Updated ${m} min ago` : `Updated ${Math.round(m / 60)} h ago`),
    open: "Open",
    moreOptions: "More options",
    website: "Website",
    maleCity: "Malé City",
    maleCitySub: "Malé · Hulhumalé · Villimalé",
    taxi: "Taxi",
    busRoutes: "Bus routes",
    every: (m: number) => `every ${m} min`,
    busNote: "Routes change with road works and Ramadan; the RTL app has live times.",
    airportTaxi: "Airport taxi fares",
    car: "Car",
    van: "7–10 seats",
    hotlines: "Hotlines",
    taxiLine: "Taxi line",
    mtcc: "MTCC ferry & bus",
    emergency: "Emergency",
    inHarbour: "In the harbour",
    ferryTickets: "Ferry tickets",
    intentTitle: "What would you like to do?",
    intentSub: "Pick one to see the boats that fit.",
    intents: {
      travel: { title: "Travel to an island", sub: (from: string) => (from ? `Ferries and launches from ${from}` : "Ferries and launches") },
      cargo: { title: "Send cargo", sub: (from: string) => (from ? `Cargo boats from ${from} and who to call` : "Cargo boats and who to call") },
    },
    back: "Back",
    sendTo: "Send to",
    whereSend: "Where is it going?",
    cargoBoats: "Cargo Boats",
    pickToCargo: "Choose where the cargo is going to see boats on this route.",
    from: "From",
    yourIsland: "Your island",
    destination: "Destination",
    noDestination: "Pick one above",
    contactsFor: "Whose contacts",
    locating: "Locating…",
    locationOffShort: "Location off",
    to: "To",
    whereTo: "Where to?",
    detecting: "Finding your island…",
    nearYou: "Near you",
    locationOff: "Location off · tap to choose",
    chooseFrom: "Travelling from",
    chooseTo: "Travelling to",
    search: "Search island or atoll…",
    useLocation: "Use my current location",
    noMatch: "No island matches",
    swap: "Swap from and to",
    launchFerry: "Launch Ferry",
    boatFerry: "Boat Ferry",
    schedule: "Boat Schedule",
    pickTo: "Choose where you're going to see boats on this route.",
    noTrips: "No boats scheduled on this route yet.",
    boatsIn: (area: string) => `Boats in ${area} Area`,
    noBoats: "No boats in this area right now.",
    quickContact: "Quick Contact",
    updated: "Updated",
    departure: "Departure",
    location: "Location",
    arrived: "Arrived Date",
    departureDate: "Departure Date",
    call: "Call",
    close: "Close",
    status: {
      notNear: "Not yet near",
      northHarbour: "North harbour\nBeyru thoshi",
      loading: "Loading cargo",
      atHarbour: "At the harbour",
    },
    contactKinds: { cargo: "Cargo", speedboat: "Speedboat", ferry: "Ferry", shop: "Shops" },
    months: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
    daysAgo: (n: number) => `${n} days ago`,
    inDays: (n: number) => `In ${n} days`,
  },
  dv: {
    boatsServing: (island: string) => `${island} އަށް ދަތުރުކުރާ ބޯޓުތައް`,
    serviceState: {
      docked_here: () => "ބަނދަރުގައި",
      loading_here: () => "ބާރު އަރުވަނީ",
      arriving: () => "ފޯރަނީ",
      en_route_here: () => "އަންނަނީ",
      loading_away: (other: string) => `${other} ގައި ބާރު އަރުވަނީ`,
      away: (other: string) => `${other} ގައި`,
      left: (other: string) => `${other} އަށް`,
    },
    movement: { arrived: "އައި", departed: "ފުރި", departs: "ފުރާނީ", arrives: "ފޯރާނީ" },
    updatedAgo: (m: number) => (m < 60 ? `${m} މިނިޓު ކުރިން` : `${Math.round(m / 60)} ގަޑިއިރު ކުރިން`),
    open: "ހުޅުވާ",
    moreOptions: "އިތުރު",
    website: "ވެބްސައިޓް",
    maleCity: "މާލެ ސިޓީ",
    maleCitySub: "މާލެ · ހުޅުމާލެ · ވިލިމާލެ",
    taxi: "ޓެކްސީ",
    busRoutes: "ބަސް ރޫޓުތައް",
    every: (m: number) => `ކޮންމެ ${m} މިނިޓަކުން`,
    busNote: "މަގު މަސައްކަތާއި ރަމަޟާނުގައި ރޫޓު ބަދަލުވެދާނެ؛ ލައިވް ގަޑިތައް RTL އެޕުގައި.",
    airportTaxi: "އެއާޕޯޓު ޓެކްސީ ރޭޓް",
    car: "ކާރު",
    van: "7–10 ގޮނޑި",
    hotlines: "ހޮޓްލައިން",
    taxiLine: "ޓެކްސީ ލައިން",
    mtcc: "އެމްޓީސީސީ ފެރީ އަދި ބަސް",
    emergency: "ކުއްލި ހާލަތު",
    inHarbour: "ބަނދަރުގައި",
    ferryTickets: "ފެރީ ޓިކެޓް",
    intentTitle: "ކޮން ކަމެއް ކުރަން ބޭނުންވަނީ؟",
    intentSub: "އެއްޗެއް ހޮވާ، އެއަށް ފެތޭ ބޯޓުތައް ފެނޭނެ.",
    intents: {
      travel: { title: "ރަށަކަށް ދަތުރުކުރުން", sub: (from: string) => (from ? `${from} އިން ފުރާ ފެރީ އަދި ލޯންޗު` : "ފެރީ އަދި ލޯންޗު") },
      cargo: { title: "ބާރު ފޮނުވުން", sub: (from: string) => (from ? `${from} އިން ފުރާ ކާގޯ ބޯޓުތަކާއި ގުޅޭނެ ނަންބަރު` : "ކާގޯ ބޯޓުތަކާއި ގުޅޭނެ ނަންބަރު") },
    },
    back: "ފަހަތަށް",
    sendTo: "ފޮނުވާ ރަށް",
    whereSend: "ބާރު ދާނީ ކޮންތާކަށް؟",
    cargoBoats: "ކާގޯ ބޯޓުތައް",
    pickToCargo: "މި މަގުގެ ބޯޓުތައް ބެލުމަށް ބާރު ފޮނުވާ ރަށް ހޮވާ.",
    from: "ކޮންތާކުން",
    yourIsland: "ތިބާ ހުރި ރަށް",
    destination: "ދާ ރަށް",
    noDestination: "މަތީގައި ހޮވާ",
    contactsFor: "ކާކުގެ ނަންބަރު",
    locating: "ހޯދަނީ…",
    locationOffShort: "ލޮކޭޝަން ނުލިބުނު",
    to: "ކޮންތާކަށް",
    whereTo: "ދާން ބޭނުންވާ ރަށް",
    detecting: "ތިބާ ހުރި ރަށް ހޯދަނީ…",
    nearYou: "ތިބާ ކައިރި",
    locationOff: "ލޮކޭޝަން ނުލިބުނު · ރަށެއް ހޮވާ",
    chooseFrom: "ފުރާ ރަށް",
    chooseTo: "ދާ ރަށް",
    search: "ރަށް ނުވަތަ އަތޮޅު ހޯދާ…",
    useLocation: "މިހާރު ހުރި ތަން ބޭނުންކުރޭ",
    noMatch: "ރަށެއް ނުފެނުނު",
    swap: "ފުރާ ރަށާއި ދާ ރަށް ބަދަލުކުރޭ",
    launchFerry: "ލޯންޗު ފެރީ",
    boatFerry: "ބޯޓު ފެރީ",
    schedule: "ބޯޓުތަކުގެ ދަތުރުތައް",
    pickTo: "މި މަގުގެ ބޯޓުތައް ބެލުމަށް ދާ ރަށް ހޮވާ.",
    noTrips: "މި މަގުގައި އަދި ބޯޓެއް ނެތް.",
    boatsIn: (area: string) => `${area} ސަރަހައްދުގައި ހުރި ބޯޓުތައް`,
    noBoats: "މިހާރު މި ސަރަހައްދުގައި ބޯޓެއް ނެތް.",
    quickContact: "ގުޅޭނެ ނަންބަރުތައް",
    updated: "އަޕްޑޭޓް",
    departure: "ފުރާ ގަޑި",
    location: "ހުރި ތަން",
    arrived: "އައި ތާރީޚް",
    departureDate: "ފުރާ ތާރީޚް",
    call: "ގުޅާ",
    close: "ބަންދުކުރޭ",
    status: {
      notNear: "އަދި ކައިރިއެއް ނުވޭ",
      northHarbour: "އުތުރު ބަނދަރު\nބޭރުތޮށި",
      loading: "ބާރު އަރުވަނީ",
      atHarbour: "ބަނދަރުގައި",
    },
    contactKinds: { cargo: "ކާގޯ", speedboat: "ސްޕީޑްބޯޓު", ferry: "ފެރީ", shop: "ފިހާރަ" },
    months: ["ޖެނުއަރީ", "ފެބްރުއަރީ", "މާރިޗު", "އޭޕްރީލް", "މެއި", "ޖޫން", "ޖުލައި", "އޮގަސްޓް", "ސެޕްޓެމްބަރު", "އޮކްޓޫބަރު", "ނޮވެމްބަރު", "ޑިސެމްބަރު"],
    days: ["އާދިއްތަ", "ހޯމަ", "އަންގާރަ", "ބުދަ", "ބުރާސްފަތި", "ހުކުރު", "ހޮނިހިރު"],
    today: "މިއަދު",
    yesterday: "އިއްޔެ",
    tomorrow: "މާދަމާ",
    daysAgo: (n: number) => `${n} ދުވަސް ކުރިން`,
    inDays: (n: number) => `${n} ދުވަސް ފަހުން`,
  },
};

export type Strings = (typeof STRINGS)["en"];

const Ctx = createContext<{ lang: Lang; t: Strings; setLang: (l: Lang) => void } | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = loadPrefs().lang;
    // Restore after hydration; localStorage isn't available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setLang(saved);
  }, []);

  const choose = useCallback((l: Lang) => {
    savePrefs({ lang: l });
    setLang(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "dv" ? "rtl" : "ltr";
  }, [lang]);

  return <Ctx.Provider value={{ lang, t: STRINGS[lang] as Strings, setLang: choose }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLang outside LangProvider");
  return v;
}

const midnight = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return +x;
};

export function relativeDays(t: Strings, d: Date, today = new Date()) {
  const diff = Math.round((midnight(today) - midnight(d)) / 86_400_000);
  if (diff === 0) return t.today;
  if (diff === 1) return t.yesterday;
  if (diff === -1) return t.tomorrow;
  return diff > 1 ? t.daysAgo(diff) : t.inDays(-diff);
}
