import type { Metadata, Viewport } from "next";
import { Poppins, Lexend } from "next/font/google";
import localFont from "next/font/local";
import { LangProvider } from "@/lib/i18n";
import { IslandsProvider } from "@/lib/islands";
import "./globals.css";

const sans = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const display = Lexend({ variable: "--font-lexend", subsets: ["latin"], weight: ["600", "700", "800"] });
// Dhivehi: MV A Waheed (calligraphy Abdulla Waheed, design Dr Hassan Hameed),
// with Noto Sans Thaana behind it for any glyph Waheed lacks. Both are
// enlarged because Thaana sits small next to Latin at the same font-size, and
// unicode-range keeps Latin letters and digits on Poppins/Lexend.
// (next/font requires literal values, so the unicode-range is repeated.)
const waheed = localFont({
  src: "../fonts/MVAWaheed.woff2",
  variable: "--font-waheed",
  weight: "400 900",
  adjustFontFallback: false,
  declarations: [
    { prop: "size-adjust", value: "125%" },
    { prop: "unicode-range", value: "U+0780-07BF, U+060C, U+061B, U+061F, U+FDF2, U+FDFD" },
  ],
});
const notoThaana = localFont({
  src: "../fonts/NotoSansThaana.ttf",
  variable: "--font-noto-thaana",
  weight: "100 900",
  adjustFontFallback: false,
  declarations: [
    { prop: "size-adjust", value: "160%" },
    { prop: "unicode-range", value: "U+0780-07BF, U+060C, U+061B, U+061F, U+FDF2, U+FDFD" },
  ],
});

export const metadata: Metadata = {
  title: "Maasinga — Ferry schedules across the Maldives",
  description: "Find boats and ferries between islands in the Maldives.",
};

export const viewport: Viewport = {
  themeColor: "#1F3FD6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${waheed.variable} ${notoThaana.variable} antialiased`}>
      <body>
        <LangProvider>
          <IslandsProvider>{children}</IslandsProvider>
        </LangProvider>
      </body>
    </html>
  );
}
