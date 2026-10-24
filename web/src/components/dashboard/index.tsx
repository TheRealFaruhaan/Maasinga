"use client";

import type { Island } from "@/lib/islands";
import { isMaleCity } from "@/lib/male";
import { useLang } from "@/lib/i18n";
import { GeneralDashboard } from "./general";
import { IslandHero } from "./parts";
import { MaleDashboard } from "./male";

/**
 * The island's own dashboard. Islands with a custom design are listed here;
 * every other island gets the general one.
 */
export function IslandDashboard({ island }: { island: Island }) {
  if (isMaleCity(island)) return <MaleDashboard island={island} />;
  return <GeneralDashboard island={island} />;
}

/** The island's name card, shown at the top of the page. */
export function IslandHeader({ island }: { island: Island }) {
  const { t } = useLang();
  if (isMaleCity(island)) return <IslandHero island={island} title={t.maleCity} subtitle={t.maleCitySub} />;
  return <IslandHero island={island} />;
}
