"use client";

import s from "./departures.module.css";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Parts of the day, by departure hour: morning 06:00-12:00, afternoon 12:00-16:00,
// evening 16:00-18:00, night 18:00-06:00 (wraps past midnight).
const PARTS: { name: string; from: number; to: number }[] = [
  { name: "Morning", from: 6, to: 12 },
  { name: "Afternoon", from: 12, to: 16 },
  { name: "Evening", from: 16, to: 18 },
  { name: "Night", from: 18, to: 30 },
];

const partOf = (t: string) => {
  const h = Number(t.slice(0, 2));
  const hh = h < 6 ? h + 24 : h;
  return PARTS.findIndex((p) => hh >= p.from && hh < p.to);
};

/** The usual departure times grouped by part of the day. The next boat today is marked; past ones fade. */
export default function DepartureRow({ usual, now }: { usual: [string, number][]; now: number }) {
  const next = now < 0 ? -1 : usual.findIndex(([t]) => toMin(t) >= now);
  return (
    <div className={s.parts}>
      {PARTS.map(({ name }, p) => {
        const times = usual.map((u, i) => ({ t: u[0], days: u[1], i })).filter((u) => partOf(u.t) === p);
        return (
          <section key={name} className={s.part} data-part={p}>
            <h3 className={s.partName}>{name}</h3>
            {times.length ? (
              <div className={s.times}>
                {times.map(({ t, days, i }) => (
                  <span key={t} className={`${s.time} ${i === next ? s.next : ""} ${now >= 0 && toMin(t) < now ? s.past : ""} num`} title={i === next ? `Next boat, ${t}` : `${t}: on ${days} of 31 days in August`}>
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className={s.none}>No boats</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
