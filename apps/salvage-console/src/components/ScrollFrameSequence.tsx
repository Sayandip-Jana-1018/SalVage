"use client";

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
  Lock,
  Pause,
  Play,
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
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isManualScrubbing, setIsManualScrubbing] = useState<boolean>(false);

  // Preload all 50 frames into memory with high-quality settings
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

  // Draw frame to canvas with crisp scaling and high image smoothing
  const renderFrame = (index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imagesRef.current[index];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const dpr = Math.max(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // High quality scaling filters
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Aspect-ratio cover math
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

    // Subtle dark radial vignette for centered modal depth
    const vignette = ctx.createRadialGradient(
      rect.width / 2,
      rect.height / 2,
      rect.width * 0.15,
      rect.width / 2,
      rect.height / 2,
      rect.width * 0.75
    );
    vignette.addColorStop(0, "rgba(5, 7, 10, 0.12)");
    vignette.addColorStop(1, "rgba(5, 7, 10, 0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.restore();
  };

  // Continuous smooth requestAnimationFrame auto-play loop
  useEffect(() => {
    if (!isPlaying || !isLoaded || isManualScrubbing) return;

    let animId: number;
    let lastTime = performance.now();
    const frameInterval = 42; // ~24 FPS cinematic loop

    const step = (time: number) => {
      if (time - lastTime >= frameInterval) {
        setCurrentFrame((prev) => {
          const next = (prev + 1) % TOTAL_FRAMES;
          renderFrame(next);
          return next;
        });
        lastTime = time;
      }
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isLoaded, isManualScrubbing]);

  // Scroll listener to smoothly interpolate frames during page scrolling
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (isManualScrubbing || !containerRef.current || !isLoaded) return;

      const rect = containerRef.current.getBoundingClientRect();
      const windowH = window.innerHeight;
      const totalScrollable = rect.height - windowH;

      if (totalScrollable <= 0) return;

      const progress = Math.max(0, Math.min(1, -rect.top / totalScrollable));
      const frameIdx = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * TOTAL_FRAMES));

      if (frameIdx !== currentFrame) {
        setIsPlaying(false);
        setCurrentFrame(frameIdx);
        renderFrame(frameIdx);
      }

      // Resume auto-play 1.5s after scrolling stops
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsPlaying(true);
      }, 1500);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [isLoaded, currentFrame, isManualScrubbing]);

  // Handle manual scrubber drag / slider
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value, 10);
    setIsPlaying(false);
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
        badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-300",
        description: "Customer checkout initiated for ₹1,850.00 on SBI UPI rail. Network handshake stream captured.",
        subtext: "Capturing timestamp, merchant ID, and rail headers",
      };
    } else if (p < 0.5) {
      return {
        stage: "02",
        title: "Systemic Outage Detection",
        badge: "ISSUER_DEGRADATION (U30)",
        badgeColor: "bg-rose-50 text-rose-800 border-rose-300",
        description: "Core banking switch timeout detected. 2D Sensing Matrix corroborates 88.4% error rate across 34 merchants.",
        subtext: "Classifier maps raw error to canonical ISSUER_OUTAGE",
      };
    } else if (p < 0.75) {
      return {
        stage: "03",
        title: "Autonomous Decision Calculus",
        badge: "E[NET_VALUE] MAXIMIZATION",
        badgeColor: "bg-amber-50 text-amber-800 border-amber-300",
        description: "Policy optimizer ranks candidate actions. Winner: SWITCH_RAIL to HDFC UPI (P(recovery) = 88%, Net Salvaged: ₹1,775.00).",
        subtext: "Safety bounds verify Quiet Hours and Max Attempt Caps",
      };
    } else {
      return {
        stage: "04",
        title: "Cryptographic Settlement",
        badge: "TAMPER_PROOF_RECOVERY",
        badgeColor: "bg-cyan-50 text-cyan-800 border-cyan-300",
        description: "HDFC rail failover succeeds. Recovery transaction committed to sha256 append-only ledger block #48220.",
        subtext: "Zero human intervention · Total recovery latency: 38.2ms",
      };
    }
  };

  const stage = getStageInfo();

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-[220vh] mb-8 flex flex-col items-center"
    >
      {/* Sticky Hero Viewport - Pulled Up & Perfectly Centered in 100vh */}
      <div className="sticky top-16 sm:top-20 w-full max-w-7xl mx-auto flex flex-col items-center">
        {/* Compact High-Impact Typography Header */}
        <div className="text-center max-w-2xl mx-auto px-4 mb-3 space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-mono tracking-wider uppercase font-semibold shadow-sm">
            <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
            <span>Interactive 3D Causal Recovery Timeline</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold tracking-tight text-slate-900 leading-normal pb-1">
            The Anatomy of an{" "}
            <span className="font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
              Autonomous Recovery
            </span>
          </h1>

          <p className="text-xs text-slate-500 font-sans max-w-lg mx-auto">
            Witness how Salvage autonomously perceives systemic outages, optimizes net value, and recovers funds.
          </p>
        </div>

        {/* 3D Canvas — Full-Width Centered, with speech bubble floating outside right edge */}
        <div className="relative w-full max-w-5xl mx-auto">
          {/* Main Video Card */}
          <div className="relative w-full rounded-2xl liquid-glass overflow-hidden border border-slate-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.06)] p-2 sm:p-3 transition-all">
            {/* Top Glass Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200/70 text-xs font-mono text-slate-600 mb-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                <span className="text-slate-900 font-bold tracking-tight text-[11px]">
                  {isPlaying ? 'LIVE 3D RECOVERY FEED' : '3D RECOVERY FEED — PAUSED'}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-2.5 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-2.5 h-2.5 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                <span className="hidden sm:inline text-[10px] text-slate-500 font-semibold">
                  FRAME {String(currentFrame + 1).padStart(2, "0")}/{TOTAL_FRAMES}
                </span>
              </div>
            </div>

            {/* Canvas Viewport */}
            <div className="relative w-full h-[320px] sm:h-[390px] lg:h-[430px] rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center shadow-inner">
              {!isLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-20 space-y-3">
                  <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                  <span className="text-xs font-mono text-slate-300">
                    Preloading High-Definition 3D Frames ({loadedPercent}%)...
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
                className="w-full h-full object-cover pointer-events-none"
              />

              {/* ✨ SPEECH BUBBLE MODAL — Docked at Top-Right Corner of Video */}
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 w-[280px] sm:w-[320px] max-w-[85%] z-20 animate-bubble-in pointer-events-auto">
                <div className="relative bg-white/92 backdrop-blur-2xl rounded-2xl rounded-tr-md p-3.5 sm:p-4 border border-slate-200/90 shadow-[0_15px_35px_rgba(0,0,0,0.18)]">
                  {/* Subtle Speech Bubble Tail pointing towards center/rabbit */}
                  <div className="absolute -bottom-2 right-8 w-3.5 h-3.5 bg-white/92 border-r border-b border-slate-200/90 rotate-45" />

                  {/* Phase badge row */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-900 tracking-wide">
                      PHASE {stage.stage}
                    </span>
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border font-bold ${stage.badgeColor}`}>
                      {stage.badge}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="text-xs sm:text-sm font-serif font-bold text-slate-900 leading-snug mb-1">
                    {stage.title}
                  </h4>

                  {/* Description */}
                  <p className="text-[10px] sm:text-[11px] text-slate-600 font-sans leading-relaxed">
                    {stage.description}
                  </p>

                  {/* Footer metadata */}
                  <div className="mt-2.5 pt-1.5 border-t border-slate-200/70 flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span className="truncate max-w-[140px]">{stage.subtext}</span>
                    <span className="flex items-center gap-0.5 text-emerald-700 font-bold shrink-0">
                      SLA: &lt;50ms <ArrowRight className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Interactive Scrubber Bar */}
            <div className="mt-2 px-3 py-1.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-600 border-t border-slate-200/70">
              <span className="text-[10px] flex items-center gap-1.5 text-slate-800 font-semibold font-sans">
                <Cpu className="w-3 h-3 text-emerald-600" />
                <span>Scrubber:</span>
              </span>

              <div className="w-full sm:w-1/2 flex items-center gap-2.5">
                <span className="text-[9px] text-slate-400 font-semibold">START</span>
                <input
                  type="range"
                  min="0"
                  max={TOTAL_FRAMES - 1}
                  value={currentFrame}
                  onChange={handleScrubberChange}
                  onMouseDown={() => {
                    setIsPlaying(false);
                    setIsManualScrubbing(true);
                  }}
                  onMouseUp={() => {
                    setIsManualScrubbing(false);
                  }}
                  onTouchStart={() => {
                    setIsPlaying(false);
                    setIsManualScrubbing(true);
                  }}
                  onTouchEnd={() => {
                    setIsManualScrubbing(false);
                  }}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900 focus:outline-none"
                />
                <span className="text-[9px] text-slate-400 font-semibold">RECOVERED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
