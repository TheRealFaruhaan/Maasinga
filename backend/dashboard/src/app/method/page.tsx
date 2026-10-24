"use client";

import { Database } from "lucide-react";
import { Dash, Grid, Panel } from "@/components/dash";
import s from "./method.module.css";

const SOURCES = [
  { name: "FollowMe GPS", used: "17.4M pings from 1,776 boats", period: "Aug 2025", owner: "Datathon organiser" },
  { name: "Avas rides", used: "Not shown: land transport only", period: "-", owner: "Datathon organiser" },
  { name: "MACL airport traffic", used: "Not shown: international flights only", period: "-", owner: "Datathon organiser" },
  { name: "MTCC", used: "Not used: passenger figures are synthetic", period: "-", owner: "Datathon organiser" },
  { name: "ERA5 gusts and ERA5-Ocean waves (team weather collector, Open-Meteo)", used: "Wave height and wind gusts, worst of 5 to 8 sea points per region", period: "Aug 2025", owner: "CC BY 4.0" },
  { name: "NASA GPM IMERG rain (team weather collector)", used: "Daily rain per region", period: "Aug 2025", owner: "NASA, public" },
  { name: "Open-Meteo marine forecast", used: "Live wave forecast on Plan a trip", period: "Live", owner: "CC BY 4.0" },
  { name: "MBS Census 2022, Table P3", used: "Residents per inhabited island", period: "2022", owner: "Maldives Bureau of Statistics" },
  { name: "OpenStreetMap", used: "Island shapes, reefs, island points", period: "Current", owner: "ODbL" },
];




export default function MethodPage() {
  return (
    <Dash title="Data sources" sub="Where every number in Maasinga comes from">
      <Grid>
        <Panel span={12} title="Data sources" icon={Database}>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Used for</th>
                  <th>Period</th>
                  <th>Licence</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.used}</td>
                    <td>{r.period}</td>
                    <td>{r.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

      </Grid>
    </Dash>
  );
}
