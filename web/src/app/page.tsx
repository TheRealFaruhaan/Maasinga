"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IslandSheet } from "@/components/island-sheet";
import { DestinationSelector } from "@/components/route-selector";
import { HERO_H, LocationPill, type FromSource } from "@/components/location-pill";
import { isMaleCity } from "@/lib/male";
import { QuickContact, SectionTitle, TripCard } from "@/components/cards";
import { IntentPicker, type Intent } from "@/components/intent";
import { IslandDashboard } from "@/components/dashboard";
import { useLang } from "@/lib/i18n";
import { DEFAULT_ISLAND_ID, getIsland, nearestIsland, type Island } from "@/lib/islands";
import { tripsFor, type FerryKind } from "@/lib/mock";
import { loadPrefs, savePrefs } from "@/lib/prefs";


export default function Home() {
  const { t, lang, setLang } = useLang();
  const [fromId, setFromId] = useState<number | null>(null);
  const [fromSource, setFromSource] = useState<FromSource>("detecting");
  const [toId, setToId] = useState<number | null>(null);
  const [toOpen, setToOpen] = useState(false);
  const [kind, setKind] = useState<FerryKind>("boat");
  const [intent, setIntent] = useState<Intent | null>(null);

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

  // Restore what they chose last time (after hydration: localStorage isn't
  // there during SSR). A hand-picked island wins over GPS.
  useEffect(() => {
    const p = loadPrefs();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (getIsland(p.toId)) setToId(p.toId!);
    if (p.ferryKind) setKind(p.ferryKind);
    if (p.intent) setIntent(p.intent);
    if (getIsland(p.fromId)) {
      setFromId(p.fromId!);
      setFromSource("manual");
    } else detect();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [detect]);

  const pickFrom = (island: Island) => {
    setFromId(island.id);
    setFromSource("manual");
    savePrefs({ fromId: island.id });
  };

  // "Use my current location": back to following GPS.
  const followGps = () => {
    savePrefs({ fromId: undefined });
    detect();
  };

  const pickTo = (island: Island) => {
    setToId(island.id);
    setToOpen(false);
    savePrefs({ toId: island.id });
  };

  const chooseKind = (k: FerryKind) => {
    setKind(k);
    savePrefs({ ferryKind: k });
  };

  const toggleIntent = (i: Intent) => {
    const next = intent === i ? null : i;
    setIntent(next);
    savePrefs({ intent: next });
    // Nothing to show until there's a destination, so ask for it right away.
    if (next && !toId) setToOpen(true);
  };

  // Cargo goes by boat (dhoni); travellers can pick launch or boat.
  const tripKind: FerryKind = intent === "cargo" ? "boat" : kind;
  const trips = useMemo(() => (from && to ? tripsFor(from, to, tripKind) : []), [from, to, tripKind]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-16 pt-[env(safe-area-inset-top)]">
      <header className="sticky top-[env(safe-area-inset-top)] z-40 flex h-[60px] items-center gap-2">
        <span className="shrink-0 font-display text-lg font-extrabold tracking-tight text-white">Maasinga</span>
        <LocationPill
          island={from}
          title={isMaleCity(from) ? t.maleCity : undefined}
          subtitle={isMaleCity(from) ? t.maleCitySub : undefined}
          source={fromSource}
          otherId={toId}
          onSelect={pickFrom}
          onUseLocation={followGps}
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

      {/* Room for the island card; the card itself is the top bar's pill,
          expanded while the page is scrolled to the top. */}
      <div aria-hidden style={{ height: HERO_H }} />

      <IntentPicker
        from={from}
        active={intent}
        onToggle={toggleIntent}
        renderPanel={(i) => (
          <>
            <DestinationSelector
              to={to}
              onPick={() => setToOpen(true)}
              label={i === "cargo" ? t.sendTo : t.to}
              placeholder={i === "cargo" ? t.whereSend : t.whereTo}
            />

            {i === "travel" && (
              <div className="mt-4 grid grid-cols-2 rounded-full bg-white/20 p-1" role="tablist">
                {(["launch", "boat"] as const).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={kind === k}
                    onClick={() => chooseKind(k)}
                    className={`rounded-full py-2.5 text-sm font-semibold uppercase tracking-wide transition ${
                      kind === k ? "bg-white text-brand shadow" : "text-brand-ink/50"
                    }`}
                  >
                    {k === "launch" ? t.launchFerry : t.boatFerry}
                  </button>
                ))}
              </div>
            )}

            <SectionTitle>{i === "cargo" ? t.cargoBoats : t.schedule}</SectionTitle>
            {!to ? (
              <button
                onClick={() => setToOpen(true)}
                className="w-full rounded-[22px] border-2 border-dashed border-white/30 px-5 py-6 text-center text-[15px] font-medium text-white/80"
              >
                {i === "cargo" ? t.pickToCargo : t.pickTo}
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

          </>
        )}
      />

      {/* Always on the page, not tucked inside a card. */}
      {from && (
        <>
          <SectionTitle>{t.quickContact}</SectionTitle>
          <QuickContact from={from} to={to} fallback={intent === "travel" ? "ferry" : "cargo"} />
        </>
      )}

      {from && (
        <div className="mt-2">
          <IslandDashboard island={from} />
        </div>
      )}

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
