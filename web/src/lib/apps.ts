// Transport apps come from the API (GET /apps?category=&place=): store
// links, hotline and icon per app. This file picks the right link per device.

export type Platform = "ios" | "android" | "other";

export interface AppLink {
  id: string;
  category: "taxi" | "ferry" | string;
  name: string;
  name_dv: string;
  /** One line on what it's for. */
  blurb: { en: string; dv: string };
  color: string;
  initials: string;
  /** Icon URL (served by the API). */
  icon?: string | null;
  iosUrl?: string | null; // App Store page
  androidPackage?: string | null; // Google Play package id
  googlePlayUrl?: string | null;
  webUrl?: string | null;
  hotline?: string | null;
  /** Place ids it serves; null = every island. */
  places?: string[] | null;
}

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
    return app.googlePlayUrl ?? app.webUrl ?? undefined;
  }
  if (platform === "ios") return app.iosUrl ?? app.webUrl ?? undefined;
  return app.webUrl ?? app.googlePlayUrl ?? (app.androidPackage ? playUrl(app.androidPackage) : app.iosUrl) ?? undefined;
}

/** Every way to reach an app, for the "more" menu. */
export function appLinks(app: AppLink) {
  return {
    hotline: app.hotline ?? undefined,
    appStore: app.iosUrl ?? undefined,
    googlePlay: app.googlePlayUrl ?? (app.androidPackage ? playUrl(app.androidPackage) : undefined),
    website: app.webUrl ?? undefined,
  };
}
