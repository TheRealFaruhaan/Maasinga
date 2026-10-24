import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import AuthGate from "@/components/AuthGate";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Maasinga: mobility data for the Maldives",
  description:
    "Maasinga turns the GPS of 1,776 boats into sea-state readings, safe-trip ratings, signal dead zones and a Travel Index for every inhabited island in the Maldives.",
};

export const viewport: Viewport = { themeColor: "#0c0d0f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before the first paint, so the page never flashes the other theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <AuthGate>
          <Sidebar />
          <div className="shell-main">{children}</div>
        </AuthGate>
      </body>
    </html>
  );
}
