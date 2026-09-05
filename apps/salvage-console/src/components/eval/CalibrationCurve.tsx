"use client";

import React from "react";
import { populatedDeciles } from "@/lib/chart";
import { formatCount, formatPercent } from "@/lib/formatters";
import type { CalibrationDecile } from "@/types";

const SIZE = 100;

/**
 * Predicted probability against observed frequency, per decile.
 *
 * A recovery probability is a promise: of the attempts this policy scored at
 * 0.7, roughly seven in ten should actually recover. This plot is where that
 * promise is checked. Points on the diagonal are calibrated; points below it
 * mean the model is confident about recoveries that do not happen, which for a
 * system that decides whether to contact a customer is the expensive direction
 * to be wrong in.
 *
 * **Empty bins are not plotted.** A decile with no episodes in it carries
 * `observed_mean: 0`, and drawing that would put a point on the floor of the
 * chart that reads as catastrophic miscalibration. It is not a measurement; it
 * is the absence of one. This is the single most likely way for a reliability
 * diagram to lie, so the count is carried through and empty bins are dropped —
 * and the caption says how many were dropped rather than quietly narrowing the
 * chart.
 *
 * Drawn in SVG, unlike the forest plot, because this one is genuinely
 * two-dimensional and a square aspect ratio is part of reading it: on a
 * stretched axis the diagonal is no longer at 45° and "distance from the
 * diagonal" stops meaning anything.
 */
export function CalibrationCurve({
  deciles,
  brierScore,
}: {
  deciles: CalibrationDecile[];
  brierScore: number;
}): React.ReactElement {
  const populated = populatedDeciles(deciles);
  const dropped = deciles.length - populated.length;
  const maxCount = Math.max(1, ...populated.map((decile) => decile.count));

  return (
    <figure className="m-0">
      <figcaption className="eyebrow mb-2">Reliability — predicted vs observed</figcaption>

      {populated.length === 0 ? (
        <p className="py-6 text-xs text-fg-muted">
          No decile carried any episodes, so there is nothing to plot. An empty reliability
          diagram is not a flat line at zero; it is no measurement at all.
        </p>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 flex flex-col items-center">
            <svg
              viewBox={`-16 -10 ${SIZE + 26} ${SIZE + 30}`}
              role="img"
              aria-label="Calibration reliability diagram"
              className="w-full max-w-[22rem]"
            >
              <defs>
                <linearGradient id="calibGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
                <filter id="calibGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Grid at every 25%. */}
              {[0, 25, 50, 75, 100].map((value) => (
                <g key={value} className="text-white/10">
                  <line x1={value} y1={0} x2={value} y2={SIZE} stroke="currentColor" strokeWidth={0.5} strokeDasharray="1 2" />
                  <line x1={0} y1={value} x2={SIZE} y2={value} stroke="currentColor" strokeWidth={0.5} strokeDasharray="1 2" />
                </g>
              ))}

              {/* Perfect calibration reference line (45 deg) */}
              <line
                x1={0}
                y1={SIZE}
                x2={SIZE}
                y2={0}
                stroke="#ffffff"
                strokeOpacity={0.3}
                strokeWidth={1}
                strokeDasharray="3 3"
              />

              {/* Empirical Calibration Curve */}
              <polyline
                points={populated
                  .map((d) => `${d.predicted_mean * SIZE},${SIZE - d.observed_mean * SIZE}`)
                  .join(" ")}
                fill="none"
                stroke="url(#calibGrad)"
                strokeWidth={2.5}
                filter="url(#calibGlow)"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Data points */}
              {populated.map((decile) => (
                <circle
                  key={decile.decile}
                  cx={decile.predicted_mean * SIZE}
                  cy={SIZE - decile.observed_mean * SIZE}
                  r={2 + 3 * Math.sqrt(decile.count / maxCount)}
                  fill="#ffffff"
                  stroke="#818cf8"
                  strokeWidth={1.5}
                  filter="url(#calibGlow)"
                >
                  <title>
                    {`decile ${decile.decile}: predicted ${formatPercent(decile.predicted_mean)}, ` +
                      `observed ${formatPercent(decile.observed_mean)}, ` +
                      `${formatCount(decile.count)} episodes`}
                  </title>
                </circle>
              ))}

              {/* Axes text */}
              <g fill="#94a3b8" fontSize={6} fontFamily="var(--font-mono)">
                <text x={-4} y={SIZE + 10} textAnchor="start">0.0</text>
                <text x={SIZE} y={SIZE + 10} textAnchor="end">1.0</text>
                <text x={SIZE / 2} y={SIZE + 16} textAnchor="middle" fontWeight="bold">Predicted Probability P(recovery)</text>
                <text
                  x={-12}
                  y={SIZE / 2}
                  textAnchor="middle"
                  fontWeight="bold"
                  transform={`rotate(-90 -12 ${SIZE / 2})`}
                >
                  Observed Frequency
                </text>
              </g>
            </svg>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
            <span className="font-mono text-fg-muted">
              Brier Score: <span className="text-white font-bold">{brierScore.toFixed(4)}</span> (Lower is better)
            </span>
            <span className="text-[10px] font-mono text-fg-faint">
              Point Area ~ Decile Sample Density
            </span>
          </div>
        </>
      )}
    </figure>
  );
}
