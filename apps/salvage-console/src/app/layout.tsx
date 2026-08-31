import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AmbientLight } from "@/components/AmbientLight";
import { CommandPalette } from "@/components/CommandPalette";
import { Navigation } from "@/components/Navigation";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

/**
 * The application shell: a centred column under a floating header and nav.
 *
 * Centred rather than a fixed left rail. A rail is the right shape for a
 * console somebody lives in all day with twenty screens; this has five, and a
 * centred column gives the glass room to be seen against the background, which
 * is most of what makes it read as depth rather than as a grey box.
 *
 * Inter for the interface, JetBrains Mono for every identifier, hash and
 * figure — a column of amounts has to line up digit for digit.
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
        <AmbientLight />

        {/* Renders nothing until opened with the keyboard. */}
        <CommandPalette />

        {/* One vertical rhythm for the whole shell. The header, the nav and the
            first panel were separated by 20px while the panels themselves are
            88px tall and rounded at 22px, so the chrome crowded the content it
            was meant to sit above. */}
        <div className="relative z-10 flex min-h-screen flex-col gap-6 pb-20 sm:gap-7">
          <TopBar />
          <Navigation />

          <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</main>

          <footer className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
            <div className="mx-auto h-px w-full max-w-md bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <p className="mx-auto mt-6 max-w-2xl text-center text-[11px] leading-relaxed text-fg-faint">
              Figures on these screens are counted by{" "}
              <span className="font-mono">salvage-core</span> and{" "}
              <span className="font-mono">salvage-brain</span> and are never rendered from a
              fixture. Evaluation results are simulated and say so; no number here describes
              production payment traffic, because this system has not run against any.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
