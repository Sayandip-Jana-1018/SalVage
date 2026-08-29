"use client";

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { formatRupees } from "@/lib/formatters";

const TOTAL_FRAMES = 50;

export function ScrollFrameSequence(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [loadedPercent, setLoadedPercent] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isManualScrubbing, setIsManualScrubbing] = useState<boolean>(false);

  // Preload all 50 frames into memory for instantaneous 60fps rendering
  useEffect(() => {
    let loadedCount = 0;
    const images: HTMLImageElement[] = [];

    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      const frameNum = String(i).padStart(3, "0");
      img.src = `/rabit/ezgif-frame-${frameNum}.jpg`;

      img.onload = () => {
        loadedCount++;
        setLoadedPercent(Math.round((loadedCount / TOTAL_FRAMES) * 100));
        if (loadedCount === TOTAL_FRAMES) {
          setIsLoaded(true);
          renderFrame(0);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === TOTAL_FRAMES) {
          setIsLoaded(true);
        }
      };
      images.push(img);
    }
    imagesRef.current = images;
  }, []);

  // Draw frame to canvas maintaining high-DPI aspect ratio
  const renderFrame = (index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imagesRef.current[index];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Cover / contain fit
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const canvasRatio = rect.width / rect.height;
    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > canvasRatio) {
      renderW = rect.height * imgRatio;
      offsetX = (rect.width - renderW) / 2;
    } else {
      renderH = rect.width / imgRatio;
      offsetY = (rect.height - renderH) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);

    // Add subtle ambient liquid glass vignette gradient overlay on the canvas
    const gradient = ctx.createRadialGradient(
      rect.width / 2,
      rect.height / 2,
      rect.width * 0.2,
      rect.width / 2,
      rect.height / 2,
      rect.width * 0.7
    );
    gradient.addColorStop(0, "rgba(5, 7, 10, 0)");
    gradient.addColorStop(1, "rgba(5, 7, 10, 0.65)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.restore();
  };

  // Scroll listener to smoothly interpolate frames
  useEffect(() => {
    const handleScroll = () => {
      if (isManualScrubbing || !containerRef.current || !isLoaded) return;

      const rect = containerRef.current.getBoundingClientRect();
      const windowH = window.innerHeight;
      const totalScrollable = rect.height - windowH;

      if (totalScrollable <= 0) return;

      const progress = Math.max(0, Math.min(1, -rect.top / totalScrollable));
      const frameIdx = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * TOTAL_FRAMES));

      if (frameIdx !== currentFrame) {
        setCurrentFrame(frameIdx);
        renderFrame(frameIdx);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoaded, currentFrame, isManualScrubbing]);

  // Handle manual scrubber drag / slider
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value, 10);
    setCurrentFrame(frame);
    renderFrame(frame);
  };

  // Determine active story stage based on current frame
  const getStageInfo = () => {
    const p = currentFrame / TOTAL_FRAMES;
    if (p < 0.25) {
      return {
        stage: "01",
        title: "Transaction Initiation",
        badge: "PAYMENT_INGESTED",
        badgeColor: "bg-emerald-950/80 text-emerald-300 border-emerald-800/60",
        description: "Customer checkout initiated (₹1,850.00 on SBI UPI rail). Telemetry stream captures raw network handshake.",
        subtext: "Capturing timestamp, merchant ID, and rail headers",
      };
    } else if (p < 0.5) {
      return {
        stage: "02",
        title: "Systemic Outage Detection",
        badge: "ISSUER_DEGRADATION (U30)",
        badgeColor: "bg-rose-950/80 text-rose-300 border-rose-800/60",
        description: "Core banking switch timeout detected. 2D Sensing Matrix corroborates 88.4% error rate across 34 merchants.",
        subtext: "Classifier maps raw error to canonical ISSUER_OUTAGE",
      };
    } else if (p < 0.75) {
      return {
        stage: "03",
        title: "Autonomous Decision Calculus",
        badge: "E[NET_VALUE] MAXIMIZATION",
        badgeColor: "bg-amber-950/80 text-amber-300 border-amber-800/60",
        description: "Policy optimizer ranks 5 actions. Winner: SWITCH_RAIL to HDFC UPI ($P=0.88$, Net Salvaged: ₹1,775.00).",
        subtext: "Safety bounds verify Quiet Hours and Max Attempt Caps",
      };
    } else {
      return {
        stage: "04",
        title: "Cryptographic Settlement",
        badge: "TAMPER_PROOF_RECOVERY",
        badgeColor: "bg-cyan-950/80 text-cyan-300 border-cyan-800/60",
        description: "HDFC rail failover succeeds. Recovery transaction committed to sha256 append-only ledger block #48220.",
        subtext: "Zero human intervention · Total recovery latency: 38.2ms",
      };
    }
  };

  const stage = getStageInfo();

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-[220vh] mb-12 flex flex-col items-center"
    >
      {/* Sticky Hero Viewport */}
      <div className="sticky top-20 w-full max-w-6xl mx-auto flex flex-col items-center">
        {/* Editorial Playfair Typography Header */}
        <div className="text-center max-w-3xl mx-auto px-4 mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full liquid-glass border border-emerald-500/20 text-xs text-emerald-300 font-mono tracking-wider uppercase mb-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Interactive 3D Causal Recovery Timeline</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif tracking-tight text-white leading-tight font-normal">
            The Anatomy of an <br className="hidden sm:inline" />
            <span className="italic font-normal bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-400 bg-clip-text text-transparent">
              Autonomous Recovery
            </span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 font-sans max-w-xl mx-auto">
            Scroll down or drag the scrubber below to witness how Salvage intercepts, diagnoses, and recovers payment failures in real time.
          </p>
        </div>

        {/* 3D Canvas + Liquid Glass Frame Container */}
        <div className="relative w-full rounded-2xl liquid-glass-glow overflow-hidden border border-white/10 shadow-2xl p-2 sm:p-4 transition-all">
          {/* Top Glass Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 text-xs font-mono text-slate-400 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-slate-200 font-semibold">LIVE RECOVERY FEED</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500">
                FRAME {String(currentFrame + 1).padStart(2, "0")}/{TOTAL_FRAMES}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-emerald-300 text-[10px] border border-white/10 font-bold">
                60 FPS INTERPOLATION
              </span>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="relative w-full h-[320px] sm:h-[450px] lg:h-[500px] rounded-xl overflow-hidden bg-[#070a0e] flex items-center justify-center">
            {!isLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070a0e]/90 z-20 space-y-3">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                <span className="text-xs font-mono text-slate-300">
                  Preloading 3D Frame Buffers ({loadedPercent}%)...
                </span>
                <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-150"
                    style={{ width: `${loadedPercent}%` }}
                  />
                </div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain pointer-events-none"
            />

            {/* Floating Liquid Glass Telemetry Card */}
            <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md liquid-glass-emerald rounded-xl p-4 border border-emerald-500/30 shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-mono font-bold text-emerald-400 tracking-wider">
                  PHASE {stage.stage} · {stage.title}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${stage.badgeColor}`}
                >
                  {stage.badge}
                </span>
              </div>

              <p className="text-xs text-slate-200 font-sans leading-relaxed">
                {stage.description}
              </p>

              <div className="mt-2.5 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px] font-mono text-emerald-300/80">
                <span>{stage.subtext}</span>
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  SLA: &lt;50ms <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Interactive Scrubber Bar */}
          <div className="mt-3 px-3 py-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400 border-t border-white/5">
            <span className="text-[11px] flex items-center gap-1.5 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Scroll page or drag scrubber to examine:</span>
            </span>

            <div className="w-full sm:w-1/2 flex items-center gap-3">
              <span className="text-[10px] text-slate-500">START</span>
              <input
                type="range"
                min="0"
                max={TOTAL_FRAMES - 1}
                value={currentFrame}
                onChange={handleScrubberChange}
                onMouseDown={() => setIsManualScrubbing(true)}
                onMouseUp={() => setIsManualScrubbing(false)}
                onTouchStart={() => setIsManualScrubbing(true)}
                onTouchEnd={() => setIsManualScrubbing(false)}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500">RECOVERED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
