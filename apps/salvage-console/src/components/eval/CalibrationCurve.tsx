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
          <svg
            viewBox={`-14 -8 ${SIZE + 22} ${SIZE + 24}`}
            role="img"
            aria-label="Calibration reliability diagram"
            className="w-full max-w-[22rem]"
          >
            {/* Grid at every 25%. */}
            {[0, 25, 50, 75, 100].map((value) => (
              <g key={value} className="text-line">
                <line x1={value} y1={0} x2={value} y2={SIZE} stroke="currentColor" strokeWidth={0.4} />
                <line x1={0} y1={value} x2={SIZE} y2={value} stroke="currentColor" strokeWidth={0.4} />
              </g>
            ))}

            {/* Perfect calibration. Dashed, because it is a reference and not data. */}
            <line
              x1={0}
              y1={SIZE}
              x2={SIZE}
              y2={0}
              className="text-fg-faint"
              stroke="currentColor"
              strokeWidth={0.6}
              strokeDasharray="3 3"
            />

            <polyline
              points={populated
                .map((d) => `${d.predicted_mean * SIZE},${SIZE - d.observed_mean * SIZE}`)
                .join(" ")}
              fill="none"
              className="text-iris"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />

            {populated.map((decile) => (
              <circle
                key={decile.decile}
                cx={decile.predicted_mean * SIZE}
                cy={SIZE - decile.observed_mean * SIZE}
                // Area carries the bin's weight, so a point resting on a handful
                // of episodes cannot look as authoritative as one resting on
                // hundreds.
                r={1.6 + 2.6 * Math.sqrt(decile.count / maxCount)}
                className="text-iris"
                fill="currentColor"
                fillOpacity={0.85}
              >
                <title>
                  {`decile ${decile.decile}: predicted ${formatPercent(decile.predicted_mean)}, ` +
                    `observed ${formatPercent(decile.observed_mean)}, ` +
                    `${formatCount(decile.count)} episodes`}
                </title>
              </circle>
            ))}

            {/* Axes. */}
            <g className="text-fg-faint" fill="currentColor" fontSize={6}>
              <text x={-4} y={SIZE + 10} textAnchor="start">0</text>
              <text x={SIZE} y={SIZE + 10} textAnchor="end">1</text>
              <text x={SIZE / 2} y={SIZE + 18} textAnchor="middle">predicted</text>
              <text
                x={-10}
                y={SIZE / 2}
                textAnchor="middle"
                transform={`rotate(-90 -10 ${SIZE / 2})`}
              >
                observed
              </text>
            </g>
          </svg>

          <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
            Brier score <span className="num font-mono text-fg">{brierScore.toFixed(3)}</span> —
            lower is better, and it is a squared error so it punishes confident wrong answers
            hardest. Point area is the number of episodes in that decile.
            {dropped > 0 ? (
              <>
                {" "}
                <span className="text-fg-faint">
                  {dropped} of {deciles.length} deciles held no episodes and are not plotted;
                  drawing them would put points on the floor that look like total
                  miscalibration rather than like no data.
                </span>
              </>
            ) : null}
          </p>
        </>
      )}
    </figure>
  );
}
