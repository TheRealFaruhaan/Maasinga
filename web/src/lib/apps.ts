// Real apps and services, gathered October 2026. Store ids and icons come
// from the official App Store / Google Play listings.

export type Platform = "ios" | "android" | "other";

export interface AppLink {
  id: string;
  name: string;
  name_dv: string;
  /** One line on what it's for. */
  blurb: { en: string; dv: string };
  color: string;
  initials: string;
  /** Store icon in /public/apps. */
  icon?: string;
  iosUrl?: string; // App Store page
  androidPackage?: string; // Google Play package id
  androidUrl?: string; // when no package id is known
  webUrl?: string;
  hotline?: string;
}

export const TAXI_APPS: AppLink[] = [
  {
    id: "male-taxi",
    name: "Malé Taxi",
    icon: "/apps/male-taxi.jpg",
    name_dv: "މާލެ ޓެކްސީ",
    blurb: { en: "Government taxi line · book or schedule", dv: "ސަރުކާރުގެ ޓެކްސީ ލައިން" },
    color: "#C2413B",
    initials: "MT",
    iosUrl: "https://apps.apple.com/app/id6761259497",
    androidPackage: "mv.mtcc.TaxiApp",
    hotline: "1655",
  },
  {
    id: "avas",
    name: "Avas App",
    icon: "/apps/avas.jpg",
    name_dv: "އަވަސް އެޕް",
    blurb: { en: "Cars, vans, bikes · Malé & Hulhumalé", dv: "ކާރު، ވޭން، ސައިކަލު" },
    color: "#F2A900",
    initials: "A",
    iosUrl: "https://apps.apple.com/app/id6478046635",
    androidPackage: "app.avas.rider",
    webUrl: "https://avasapp.com/",
  },
  {
    id: "nala",
    name: "Nala Taxi",
    icon: "/apps/nala.jpg",
    iosUrl: "https://apps.apple.com/app/id6740810498",
    name_dv: "ނާލާ ޓެކްސީ",
    blurb: { en: "Malé, Hulhumalé, airport", dv: "މާލެ، ހުޅުމާލެ، އެއާޕޯޓު" },
    color: "#2E8BD8",
    initials: "N",
    androidPackage: "nala.taxi.passenger",
    webUrl: "https://www.nalataxi.com/",
  },
  {
    id: "quick",
    name: "Quick Mv",
    icon: "/apps/quick.jpg",
    iosUrl: "https://apps.apple.com/app/id6673896033",
    name_dv: "ކުއިކް އެމްވީ",
    blurb: { en: "City rides & airport transfers", dv: "ސިޓީ ދަތުރު އަދި އެއާޕޯޓު" },
    color: "#2BA58F",
    initials: "Q",
    androidPackage: "quick.mv.maldives.taxi.passenger",
  },
];

export const RTL_APP: AppLink = {
  id: "rtl",
  name: "RTL Travel",
  icon: "/apps/rtl.jpg",
  name_dv: "އާރުޓީއެލް",
  blurb: { en: "MTCC ferry & bus tickets, QR e-tickets", dv: "އެމްޓީސީސީ ފެރީ އަދި ބަސް ޓިކެޓް" },
  color: "#1F3FD6",
  initials: "RTL",
  iosUrl: "https://apps.apple.com/app/id1605778705",
  androidPackage: "com.scsoft.maldivesrtl",
  hotline: "1650",
};

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}

export const playUrl = (pkg: string) => `https://play.google.com/store/apps/details?id=${pkg}`;

/**
 * Best link for this device. On Android with a known package it's an intent
 * URL: opens the app when installed, else its Play page. On iOS the App Store
 * page (which shows "Open" when installed). Elsewhere, the web or store page.
 */
export function appHref(app: AppLink, platform: Platform): string | undefined {
  if (platform === "android") {
    if (app.androidPackage) {
      const fallback = encodeURIComponent(playUrl(app.androidPackage));
      return `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${app.androidPackage};S.browser_fallback_url=${fallback};end`;
    }
    return app.androidUrl ?? app.webUrl;
  }
  if (platform === "ios") return app.iosUrl ?? app.webUrl;
  return app.webUrl ?? (app.androidPackage ? playUrl(app.androidPackage) : app.iosUrl ?? app.androidUrl);
}

export const EMERGENCY = [
  { id: "police", number: "119", en: "Police", dv: "ފުލުހުން" },
  { id: "ambulance", number: "102", en: "Ambulance", dv: "އެމްބިއުލާންސް" },
  { id: "fire", number: "118", en: "Fire & Rescue", dv: "ފަޔަރ އެންޑް ރެސްކިއު" },
];

/** Every way to reach an app, for the "more" menu. */
export function appLinks(app: AppLink) {
  return {
    hotline: app.hotline,
    appStore: app.iosUrl,
    googlePlay: app.androidPackage ? playUrl(app.androidPackage) : app.androidUrl,
    website: app.webUrl,
  };
}
