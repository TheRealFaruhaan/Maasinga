"use client";

import { ChevronRight, MapPin, Phone, Sailboat, Ship, Store, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { relativeDays, useLang } from "@/lib/i18n";
import type { Island } from "@/lib/islands";
import { contactsFor, type BoatInArea, type ContactKind, type Trip } from "@/lib/mock";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-7">
      <h2 className="text-[22px] font-bold leading-tight text-white">{children}</h2>
      <div className="mt-1.5 h-[3px] w-11 rounded-full bg-sky-300" />
    </div>
  );
}

function IslandStop({ island }: { island: Island }) {
  const { lang } = useLang();
  return (
    <div className="min-w-0">
      <div className="font-display text-[26px] font-extrabold leading-none text-brand" dir="ltr">
        {island.code}
      </div>
      <div className="mt-0.5 truncate text-[9px] font-semibold uppercase text-brand-ink/40" title={island.name_en}>
        {lang === "dv" ? island.name_dv : island.name_en}
      </div>
    </div>
  );
}

function BoatName({ name_dv, name_en, size = "md" }: { name_dv: string; name_en: string; size?: "md" | "lg" }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col items-center justify-center text-center text-white">
      <span className={`font-thaana leading-tight ${size === "lg" ? "text-[20px]" : "text-[17px]"}`} dir="rtl">
        {name_dv}
      </span>
      <span className="mt-0.5 max-w-full truncate font-display text-[10px] font-bold uppercase tracking-normal">{name_en}</span>
    </div>
  );
}

export function TripCard({ trip, from, to }: { trip: Trip; from: Island; to: Island }) {
  const { t, lang } = useLang();
  return (
    <article className="flex overflow-hidden rounded-[22px] bg-white/15">
      <div className="flex w-[78px] shrink-0 flex-col items-center justify-center py-3 text-white">
        <span className="font-thaana text-[11px] opacity-80">{t.days[trip.date.getDay()]}</span>
        <span className="font-display text-[40px] font-extrabold leading-none">{trip.date.getDate()}</span>
        <span className={`font-bold leading-tight ${lang === "dv" ? "font-thaana text-[11px]" : "text-lg"}`}>
          {t.months[trip.date.getMonth()]}
        </span>
      </div>
      <div className="relative min-w-0 flex-1 rounded-[20px] bg-white">
        <div className="flex">
          <div className="flex min-w-0 flex-1 flex-col px-3 pt-2.5">
            <div className="relative grid grid-cols-2 gap-x-6">
              <IslandStop island={from} />
              <IslandStop island={to} />
              <ChevronRight
                className="absolute left-1/2 top-0.5 size-6 -translate-x-1/2 text-brand/15 rtl:rotate-180"
                strokeWidth={3}
              />
            </div>
            <div className="mt-1.5 flex h-5 items-center">
              {trip.updated ? (
                <span className="-ms-3 rounded-e-md bg-[#C2413B] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t.updated}
                </span>
              ) : (
                <span className="flex w-full items-center gap-1 pe-2">
                  <span className="size-1.5 rounded-full bg-brand-ink/20" />
                  <span className="h-px flex-1 border-t border-dashed border-brand-ink/20" />
                  <span className="size-1.5 rounded-full bg-brand-ink/20" />
                </span>
              )}
            </div>
          </div>
          <div
            className="flex w-[34%] shrink-0 items-center justify-center rounded-es-[20px] rounded-se-[20px] px-1.5 py-2"
            style={{ background: trip.boat.color }}
          >
            <BoatName name_dv={trip.boat.name_dv} name_en={trip.boat.name_en} />
          </div>
        </div>
        <div className="flex gap-5 px-3 pb-2.5 pt-1.5">
          <div>
            <div className="text-[9px] font-semibold text-brand-ink/40">{t.departure}</div>
            <div className="font-display text-lg font-extrabold leading-tight text-brand" dir="ltr">
              {trip.time}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-brand-ink/40">{t.location}</div>
            <div className="line-clamp-2 font-display text-[15px] font-extrabold uppercase leading-[1.15] text-brand">
              {trip.location[lang]}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

const fmtDate = (d: Date, months: string[]) => `${d.getDate()} ${months[d.getMonth()]}`;

export function BoatAreaCard({ item }: { item: BoatInArea }) {
  const { t, lang } = useLang();
  return (
    <article className="overflow-hidden rounded-[20px] bg-white">
      <div className="relative flex h-[84px] items-center justify-end px-3" style={{ background: item.boat.color }}>
        <span className="absolute start-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-brand text-white">
          <Truck className="size-4" />
        </span>
        <BoatName name_dv={item.boat.name_dv} name_en={item.boat.name_en} size="lg" />
      </div>
      <div className="grid grid-cols-2 gap-1 border-b-2 border-brand/80 px-2.5 py-2">
        <div>
          <div className="text-[9px] font-semibold text-brand-ink/40">{t.arrived}</div>
          <div className="font-display text-lg font-extrabold leading-tight text-brand">
            {fmtDate(item.arrived, t.months)}
          </div>
          <div className="text-[9px] text-brand-ink/40">{relativeDays(t, item.arrived)}</div>
        </div>
        <div>
          <div className="text-[9px] font-semibold text-brand-ink/40">{t.departureDate}</div>
          <div className="font-display text-lg font-extrabold leading-tight text-brand">
            {item.departure ? fmtDate(item.departure, t.months) : "–"}
          </div>
          <div className="text-[9px] text-brand-ink/40">
            {item.departure ? relativeDays(t, item.departure) : "-"}
          </div>
        </div>
      </div>
      <div className="relative min-h-[52px] px-2.5 py-2">
        <p className={`whitespace-pre-line text-[13px] font-semibold leading-snug ${lang === "dv" ? "font-thaana" : ""}`}>
          {t.status[item.status]}
        </p>
        <MapPin className="absolute -bottom-1 end-1 size-10 fill-brand/10 text-brand/15" />
      </div>
    </article>
  );
}

const CONTACT_TABS: { kind: ContactKind; Icon: typeof Truck }[] = [
  { kind: "cargo", Icon: Truck },
  { kind: "speedboat", Icon: Sailboat },
  { kind: "ferry", Icon: Ship },
  { kind: "shop", Icon: Store },
];

/**
 * Contacts for the person's island, with a switch to the destination's so
 * they can reach someone there before sending a package. The chosen side and
 * tab are remembered.
 */
export function QuickContact({ from, to, fallback = "cargo" }: { from: Island; to?: Island; fallback?: ContactKind }) {
  const { t, lang } = useLang();
  const [kind, setKindState] = useState<ContactKind>(fallback);
  const [sideState, setSideState] = useState<"here" | "dest">("here");
  useEffect(() => {
    const p = loadPrefs();
    // Restore after hydration; localStorage isn't available during SSR.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (p.contactTab?.home) setKindState(p.contactTab.home);
    if (p.contactSide) setSideState(p.contactSide);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const setKind = (k: ContactKind) => {
    setKindState(k);
    savePrefs({ contactTab: { ...loadPrefs().contactTab, home: k } });
  };
  const setSide = (v: "here" | "dest") => {
    setSideState(v);
    savePrefs({ contactSide: v });
  };

  const side = to ? sideState : "here";
  const island = side === "dest" && to ? to : from;
  const contacts = useMemo(() => contactsFor(island)[kind], [island, kind]);
  const nameOf = (i: Island) => (lang === "dv" ? i.name_dv : i.name_en);

  return (
    <div className="overflow-hidden rounded-[22px] bg-white/15">
      {/* Whose contacts: your island, or where the package is going. */}
      <div className="relative m-1.5 grid grid-cols-2 rounded-full bg-brand-ink/25 p-1" role="radiogroup" aria-label={t.contactsFor}>
        <span
          aria-hidden
          className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-white shadow transition-[inset-inline-start] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] ${
            side === "here" ? "start-1" : "start-[calc(50%)]"
          }`}
        />
        {([
          ["here", from, t.yourIsland],
          ["dest", to, t.destination],
        ] as const).map(([v, isl, label]) => (
          <button
            key={v}
            role="radio"
            aria-checked={side === v}
            disabled={!isl}
            onClick={() => setSide(v)}
            className={`relative z-10 flex min-w-0 flex-col items-center rounded-full px-2 py-1.5 transition-colors disabled:opacity-40 ${
              side === v ? "text-brand" : "text-white"
            }`}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${side === v ? "text-brand/60" : "text-white/60"}`}>
              {label}
            </span>
            <span className="flex max-w-full items-center gap-1 truncate text-[14px] font-bold">
              {isl ? (
                <>
                  <span className="font-display" dir="ltr">{isl.code}</span>
                  <span className="truncate">{nameOf(isl)}</span>
                </>
              ) : (
                <span className="truncate font-medium opacity-80">{t.noDestination}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-1.5 pb-1.5" role="tablist">
        {CONTACT_TABS.map(({ kind: k, Icon }) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            aria-label={t.contactKinds[k]}
            onClick={() => setKind(k)}
            className={`grid h-14 flex-1 place-items-center rounded-[18px] transition ${
              kind === k ? "bg-white text-brand" : "text-white"
            }`}
          >
            <Icon className="size-7" />
          </button>
        ))}
      </div>
      <ul key={`${island.id}-${kind}`} className="animate-[maas-in_.25s_ease-out]">
        {contacts.map((c) => (
          <li key={c.name} className="flex items-center border-t-2 border-brand/60 px-3 py-2.5 text-white">
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-sm font-bold uppercase tracking-wide">{c.name}</div>
              <div className="font-display text-[28px] font-extrabold leading-none tracking-wide" dir="ltr">
                {c.phone}
              </div>
            </div>
            {/^\d+$/.test(c.phone) ? (
              <a
                href={`tel:${c.phone}`}
                aria-label={`${t.call} ${c.name}`}
                className="grid size-11 place-items-center rounded-full text-white/40 active:bg-white/10"
              >
                <Phone className="size-7 fill-white/30" />
              </a>
            ) : (
              // Placeholder number: nothing to dial.
              <span aria-hidden className="grid size-11 place-items-center text-white/15">
                <Phone className="size-7" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
