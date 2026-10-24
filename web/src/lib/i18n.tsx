"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "dv";

// Dhivehi strings are a first pass — have a native speaker review before launch.
const STRINGS = {
  en: {
    from: "From",
    yourIsland: "Your island",
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
    from: "ކޮންތާކުން",
    yourIsland: "ތިބާ ހުރި ރަށް",
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
const KEY = "maasinga_lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    // Restore after hydration; localStorage isn't available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "en" || saved === "dv") setLang(saved);
  }, []);

  const choose = useCallback((l: Lang) => {
    localStorage.setItem(KEY, l);
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
