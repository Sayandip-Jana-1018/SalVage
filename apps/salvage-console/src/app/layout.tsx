import type { Metadata } from "next";
import { JetBrains_Mono, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import { Header } from "@/components/Header";
import { Navigation } from "@/components/Navigation";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Salvage — Autonomous Payment Recovery Platform",
  description: "FAANG-grade autonomous payment failure diagnosis and recovery platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-[#f8fafc] text-slate-900 antialiased flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-900">
        {/* Ambient subtle light gradient orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/10 rounded-full blur-[140px] animate-pulse-slow" />
          <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] bg-indigo-500/05 rounded-full blur-[160px]" />
          <div className="absolute top-2/3 -right-40 w-[600px] h-[600px] bg-sky-500/05 rounded-full blur-[160px]" />
        </div>

        {/* Global Floating Header & Centered Navigation */}
        <div className="relative z-50 w-full flex flex-col items-center">
          <Header />
          <Navigation />
        </div>

        {/* Center-Aligned Main Content Container */}
        <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center">
          <div className="w-full">{children}</div>
        </main>

        {/* Subtle Luxury Footer */}
        <footer className="relative z-10 w-full border-t border-slate-200/80 bg-white/80 backdrop-blur-md py-6 text-center text-xs text-slate-500 font-mono">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              SALVAGE RECOVERY ENGINE · REAL-TIME SHA-256 AUDITED
            </span>
            <span className="text-slate-500 font-medium">SUB-50ms SLA · DETERMINISTIC MONEY BOUNDS</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
