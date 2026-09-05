import React from "react";
import { stateClass } from "@/lib/formatters";

/**
 * The small pieces: a state dot, a chip, a stat, a table shell.
 *
 * Every one of them takes the state as a *string* and asks `stateClass` for the
 * colour rather than being handed one. That indirection is the whole reason
 * green means the same thing on every screen, and it is why an unrecognised
 * state renders slate here instead of quietly picking the first branch of a
 * switch somewhere.
 */

export function StateDot({
  state,
  className = "",
}: {
  state: string;
  className?: string;
}): React.ReactElement {
  const down = state === "DOWN";
  return (
    <span
      // Only DOWN animates. A healthy element that pulses trains an operator to
      // ignore movement, which is the one signal worth keeping expensive.
      className={`${stateClass(state)} state-dot ${down ? "alarm" : ""} ${className}`}
      aria-hidden
    />
  );
}

export function StateChip({
  state,
  label,
}: {
  state: string;
  label?: string;
}): React.ReactElement {
  return (
    <span
      className={`${stateClass(state)} state-chip inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10.5px] font-bold tracking-wider uppercase backdrop-blur-md`}
    >
      <StateDot state={state} />
      <span>{label ?? state}</span>
    </span>
  );
}

/** A neutral chip, for taxonomy codes, event types and reasoning tokens. */
export function Chip({
  children,
  title,
  tone = "neutral",
}: {
  children: React.ReactNode;
  title?: string;
  tone?: "neutral" | "accent" | "healthy" | "degraded" | "down";
}): React.ReactElement {
  const accent = {
    neutral: "border-white/12 bg-white/[0.05] text-fg-muted",
    accent: "border-iris/40 bg-iris/15 text-iris shadow-[0_0_12px_rgba(99,102,241,0.25)] font-semibold",
    healthy: "border-healthy/40 bg-healthy/15 text-healthy shadow-[0_0_12px_rgba(16,185,129,0.25)] font-semibold",
    degraded: "border-degraded/40 bg-degraded/15 text-degraded shadow-[0_0_12px_rgba(245,158,11,0.25)] font-semibold",
    down: "border-down/40 bg-down/15 text-down shadow-[0_0_12px_rgba(244,63,94,0.25)] font-semibold",
  }[tone];

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 font-mono text-[10.5px] tracking-wide ${accent}`}
    >
      {children}
    </span>
  );
}

/**
 * One counted figure.
 *
 * `value` is pre-formatted by the caller, because the caller knows whether it
 * is money, a count or a percentage and this component must not guess. An
 * em-dash is the right value when a figure is genuinely unavailable, and it is
 * visually distinct from a zero on purpose.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "healthy" | "degraded" | "down" | "accent";
}): React.ReactElement {
  const colour = {
    default: "text-fg",
    healthy: "text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]",
    degraded: "text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]",
    down: "text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.4)]",
    accent: "text-iris drop-shadow-[0_0_12px_rgba(129,140,248,0.4)]",
  }[tone];

  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className={`num mt-2 font-mono text-2xl sm:text-3xl font-extrabold tracking-tight ${colour}`}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-muted font-normal">{hint}</p> : null}
    </div>
  );
}

/**
 * A table that scrolls inside its own box.
 *
 * Wide tables are the normal case here — rail ids, hashes and five money
 * columns — and a page that scrolls sideways as a whole is unusable next to a
 * fixed sidebar.
 */
export function DataTable({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-white/[0.08] bg-black/20 backdrop-blur-md">
      <table className="w-full min-w-[42rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-white/[0.08] bg-white/[0.02]">{head}</tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}): React.ReactElement {
  return (
    <th
      className={`eyebrow px-4 py-3 font-bold ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  title?: string;
}): React.ReactElement {
  return (
    <td
      title={title}
      className={`px-4 py-3.5 text-[12.5px] ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

/** The one loading affordance: a hairline that sweeps while a request is open. */
export function LoadingBar(): React.ReactElement {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-iris to-cyber-cyan shadow-[0_0_12px_rgba(99,102,241,0.8)] sweep" />
    </div>
  );
}

export function Mono({
  value,
  chars,
  className = "",
}: {
  value: string;
  chars?: number;
  className?: string;
}): React.ReactElement {
  const shown = chars && value.length > chars ? `${value.slice(0, chars)}…` : value;
  return (
    <code
      title={value}
      className={`rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg tracking-wide ${className}`}
    >
      {shown}
    </code>
  );
}
