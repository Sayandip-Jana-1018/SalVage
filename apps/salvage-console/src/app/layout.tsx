import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

/**
 * The application shell: a fixed top bar, a fixed nav rail, and a scrolling
 * content column.
 *
 * Two faces, both doing a job. Inter for the interface; JetBrains Mono for
 * every identifier, hash and figure, because a column of amounts has to line
 * up digit for digit. The display serif that used to be here (Playfair) was
 * setting a magazine tone on an operations screen.
 */

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Salvage — payment recovery console",
  description:
    "Operator console for Salvage: live rail sensing, per-attempt decision autopsies, "
    + "the tamper-evident ledger, and the measured off-policy evaluation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ink-0 text-fg antialiased">
        <div className="atmosphere" aria-hidden />

        <div className="relative z-10 flex min-h-screen flex-col">
          <TopBar />

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <Sidebar />

            <main className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">
                {children}
              </div>

              <footer className="mt-6 border-t border-line px-4 py-5 sm:px-6 lg:px-8">
                <p className="max-w-3xl text-[11px] leading-relaxed text-fg-faint">
                  Figures on these screens are counted by <span className="font-mono">salvage-core</span>{" "}
                  and <span className="font-mono">salvage-brain</span> and are never rendered from a
                  fixture. Evaluation results are simulated and say so; no number here describes
                  production payment traffic, because this system has not run against any.
                </p>
              </footer>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
