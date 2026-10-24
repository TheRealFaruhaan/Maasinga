"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IslandSheet } from "@/components/island-sheet";
import { DestinationSelector } from "@/components/route-selector";
import { LocationPill, type FromSource } from "@/components/location-pill";
import { BoatAreaCard, QuickContact, SectionTitle, TripCard } from "@/components/cards";
import { useLang } from "@/lib/i18n";
import { DEFAULT_ISLAND_ID, getIsland, nearestIsland, type Island } from "@/lib/islands";
import { boatsInArea, tripsFor, type FerryKind } from "@/lib/mock";

const TO_KEY = "maasinga_to";

export default function Home() {
  const { t, lang, setLang } = useLang();
  const [fromId, setFromId] = useState<number | null>(null);
  const [fromSource, setFromSource] = useState<FromSource>("detecting");
  const [toId, setToId] = useState<number | null>(null);
  const [toOpen, setToOpen] = useState(false);
  const [kind, setKind] = useState<FerryKind>("boat");

  const from = getIsland(fromId);
  const to = getIsland(toId);

  // From: the island nearest the user. Falls back to Malé when location is
  // denied, unavailable, or the user is outside the Maldives.
  const detect = useCallback(() => {
    setFromSource("detecting");
    const fallback = () => {
      setFromId((cur) => {
        const id = cur ?? DEFAULT_ISLAND_ID;
        // From and To must differ; drop a saved To that collides.
        setToId((to) => (to === id ? null : to));
        return id;
      });
      setFromSource("fallback");
    };
    if (!("geolocation" in navigator)) return fallback();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const hit = nearestIsland(pos.coords.latitude, pos.coords.longitude);
        if (!hit) return fallback();
        setFromId(hit.island.id);
        setFromSource("gps");
        setToId((cur) => (cur === hit.island.id ? null : cur));
      },
      fallback,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }, []);

  useEffect(() => {
    const saved = Number(localStorage.getItem(TO_KEY));
    // Restore after hydration; localStorage isn't available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (getIsland(saved)) setToId(saved);
    detect();
  }, [detect]);

  useEffect(() => {
    if (toId) localStorage.setItem(TO_KEY, String(toId));
  }, [toId]);

  const pickFrom = (island: Island) => {
    setFromId(island.id);
    setFromSource("manual");
  };

  const pickTo = (island: Island) => {
    setToId(island.id);
    setToOpen(false);
  };

  const trips = useMemo(() => (from && to ? tripsFor(from, to, kind) : []), [from, to, kind]);
  const area = useMemo(() => (from ? boatsInArea(from, kind) : []), [from, kind]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-16 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="relative z-40 mb-4 flex h-10 items-center gap-2">
        <span className="shrink-0 font-display text-lg font-extrabold tracking-tight text-white">Maasinga</span>
        <LocationPill
          island={from}
          source={fromSource}
          otherId={toId}
          onSelect={pickFrom}
          onUseLocation={detect}
        />
        {/* One button that offers the other language. */}
        <button
          onClick={() => setLang(lang === "en" ? "dv" : "en")}
          aria-label={lang === "en" ? "ދިވެހިން ބަލާ" : "View in English"}
          className={`h-8 shrink-0 rounded-full bg-white/15 px-3 text-xs font-bold text-white ${
            lang === "en" ? "font-thaana text-[13px]" : ""
          }`}
        >
          {lang === "en" ? "ދިވެހި" : "EN"}
        </button>
      </header>

      <DestinationSelector to={to} onPick={() => setToOpen(true)} />

      <div className="mt-5 grid grid-cols-2 rounded-full bg-white/20 p-1" role="tablist">
        {(["launch", "boat"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full py-2.5 text-sm font-semibold uppercase tracking-wide transition ${
              kind === k ? "bg-white text-brand shadow" : "text-brand-ink/50"
            }`}
          >
            {k === "launch" ? t.launchFerry : t.boatFerry}
          </button>
        ))}
      </div>

      <SectionTitle>{t.schedule}</SectionTitle>
      {!to ? (
        <button
          onClick={() => setToOpen(true)}
          className="w-full rounded-[22px] border-2 border-dashed border-white/30 px-5 py-6 text-center text-[15px] font-medium text-white/80"
        >
          {t.pickTo}
        </button>
      ) : trips.length === 0 ? (
        <p className="rounded-[22px] bg-white/10 px-5 py-6 text-center text-white/70">{t.noTrips}</p>
      ) : (
        <div className="space-y-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} from={from!} to={to} />
          ))}
        </div>
      )}

      {from && (
        <>
          <SectionTitle>{t.boatsIn(from.code)}</SectionTitle>
          {area.length === 0 ? (
            <p className="rounded-[22px] bg-white/10 px-5 py-6 text-center text-white/70">{t.noBoats}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {area.map((b) => (
                <BoatAreaCard key={b.boat.id} item={b} />
              ))}
            </div>
          )}
        </>
      )}

      <SectionTitle>{t.quickContact}</SectionTitle>
      <QuickContact />

      <IslandSheet
        open={toOpen}
        title={t.chooseTo}
        selectedId={toId}
        otherId={fromId}
        onSelect={pickTo}
        onClose={() => setToOpen(false)}
      />
    </main>
  );
}
