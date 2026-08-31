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
      className={`${stateClass(state)} state-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase`}
    >
      <StateDot state={state} />
      {label ?? state}
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
  tone?: "neutral" | "accent";
}): React.ReactElement {
  const accent =
    tone === "accent"
      ? "border-iris/35 bg-iris/10 text-iris"
      : "border-white/12 bg-white/[0.06] text-fg-muted";
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] tracking-wide ${accent}`}
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
    healthy: "text-healthy",
    degraded: "text-degraded",
    down: "text-down",
    accent: "text-iris",
  }[tone];

  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className={`num mt-1.5 font-mono text-xl font-semibold tracking-[-0.02em] ${colour}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-fg-faint">{hint}</p> : null}
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
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-white/[0.07]">{head}</tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
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
      className={`eyebrow px-3 pb-2.5 pt-1 font-semibold ${align === "right" ? "text-right" : "text-left"}`}
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
      className={`px-3 py-2.5 text-xs ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

/** The one loading affordance: a hairline that sweeps while a request is open. */
export function LoadingBar(): React.ReactElement {
  return <div className="sweep relative h-px w-full overflow-hidden bg-white/10" aria-hidden />;
}

/** A monospace identifier, truncated with the full value on hover. */
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
    <span title={value} className={`font-mono text-fg-muted ${className}`}>
      {shown}
    </span>
  );
}
