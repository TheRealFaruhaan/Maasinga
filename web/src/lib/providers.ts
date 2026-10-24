// Who the data comes from, for the footer. Logos live in /public/providers.

export interface Provider {
  id: string;
  name: string;
  what: { en: string; dv: string };
  url: string;
  logo?: string;
  /** White logos need a dark tile. */
  dark?: boolean;
  /** Logo is only an icon; show the name beside it. */
  iconOnly?: boolean;
  /** Wide wordmark: give it two grid cells. */
  wide?: boolean;
}

/** Where the data comes from: the source organisations only. */
export const PROVIDERS: Provider[] = [
  // Through the Maasinga API
  { id: "followme", name: "FollowMe", what: { en: "Boat GPS", dv: "ބޯޓު ޖީޕީއެސް" }, url: "https://followme.mv/" },
  { id: "openmeteo", name: "Open-Meteo", what: { en: "Sea forecast", dv: "ކަނޑުގެ ފޯކާސްޓް" }, url: "https://open-meteo.com/" },
  { id: "nasa", name: "NASA IMERG", what: { en: "Rain", dv: "ވާރޭ" }, url: "https://gpm.nasa.gov/data/imerg" },
  { id: "era5", name: "Copernicus ERA5", what: { en: "Waves & wind", dv: "ރާޅާއި ވައި" }, url: "https://cds.climate.copernicus.eu/" },
  { id: "census", name: "MBS Census 2022", what: { en: "Islands & population", dv: "ރަށްތަކާއި އާބާދީ" }, url: "https://census.gov.mv/" },
  { id: "osm", name: "OpenStreetMap", what: { en: "© OpenStreetMap contributors", dv: "© OpenStreetMap contributors" }, url: "https://www.openstreetmap.org/copyright" },
  // Hand-written Malé City info (not in the API yet)
  { id: "mtcc", name: "MTCC", what: { en: "Bus routes", dv: "ބަސް ރޫޓު" }, url: "https://mtcc.mv/" },
  { id: "macl", name: "MACL", what: { en: "Airport fares", dv: "އެއާޕޯޓު އަގު" }, url: "https://www.macl.aero/" },
];

// Logos from each organisation's own site, except MTCC's (mtcc.mv is behind a
// bot check; official logo from Wikimedia Commons, CC BY-SA 1.0) and NASA's
// (supplied by the team; frame fixed so it isn't cropped).
const LOGOS: Record<string, Pick<Provider, "logo" | "dark" | "iconOnly" | "wide">> = {
  mtcc: { logo: "/providers/mtcc.png" },
  followme: { logo: "/providers/followme.png" },
  macl: { logo: "/providers/macl.svg", dark: true },
  openmeteo: { logo: "/providers/openmeteo.svg", dark: true, iconOnly: true },
  nasa: { logo: "/providers/nasa.svg", iconOnly: true },
  era5: { logo: "/providers/copernicus.svg", dark: true, wide: true },
  census: { logo: "/providers/mbs.svg", wide: true },
  osm: { logo: "/providers/osm.svg" }, // the caption carries the required credit
};

export const withLogo = (p: Provider): Provider => ({ ...p, ...LOGOS[p.id] });
