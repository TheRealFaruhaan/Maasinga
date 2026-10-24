import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Maasinga Policy",
  description: "Sea mobility indexes for policy makers.",
  robots: { index: false, follow: false },
};

/** The policy dashboard: its own light shell, separate from the public app. */
export default function PolicyLayout({ children }: LayoutProps<"/policy">) {
  return <div className="min-h-dvh bg-[#f4f6fb] text-[#0b1a66]">{children}</div>;
}
