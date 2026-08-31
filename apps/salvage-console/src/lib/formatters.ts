/**
 * Display helpers. Money is an integer count of paise, all the way to the string.
 *
 * The version this replaces did `paise / 100` and handed the float to
 * `Intl.NumberFormat`. That is the wrong type for money: 1999 paise divided by
 * 100 is not 19.99, it is the nearest double to it, and every sum, comparison
 * and total built on that carries the error forward. Formatting to two decimal
 * places hides it rather than removing it.
 *
 * Everything below does integer arithmetic and then builds the string. The one
 * division is exact by construction: `abs - (abs % 100)` is a multiple of 100,
 * IEEE division returns the correctly-rounded quotient, and that quotient is an
 * integer below 2^53, so it is representable exactly.
 *
 * Grouping is the Indian convention — last three digits, then pairs. The people
 * reading this screen read 12,34,567 fluently and 1,234,567 slowly.
 */

const RUPEE = "₹";

/** `185000` becomes `₹1,850.00`. Negative amounts read `-₹5.00`. */
export function formatPaise(paise: number): string {
  const { sign, rupees, remainder } = splitPaise(paise);
  return `${sign}${RUPEE}${groupIndian(rupees)}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Whole rupees, for a headline tile where two decimal places are noise.
 *
 * Truncates towards zero rather than rounding: a tile that reads ₹1,850 when
 * the figure is ₹1,850.99 understates by a paisa, and one that rounds up
 * overstates. Understating a recovered amount is the safer direction.
 */
export function formatRupeesWhole(paise: number): string {
  const { sign, rupees } = splitPaise(paise);
  return `${sign}${RUPEE}${groupIndian(rupees)}`;
}

/** Counts, grouped the same way as money so columns align. */
export function formatCount(value: number): string {
  const rounded = Math.trunc(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${groupIndian(Math.abs(rounded))}`;
}

function splitPaise(paise: number): { sign: string; rupees: number; remainder: number } {
  const whole = Math.trunc(paise);
  const sign = whole < 0 ? "-" : "";
  const abs = Math.abs(whole);
  const remainder = abs % 100;
  return { sign, rupees: (abs - remainder) / 100, remainder };
}

/** `1234567` becomes `12,34,567`. */
export function groupIndian(value: number): string {
  const digits = String(Math.trunc(Math.abs(value)));
  if (digits.length <= 3) return digits;

  const tail = digits.slice(-3);
  let head = digits.slice(0, -3);
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) parts.unshift(head);
  return [...parts, tail].join(",");
}

/** A fraction as a percentage, always to one decimal place. */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatISTTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

/** A short relative age, for "sensed 12s ago". */
export function formatAge(isoString: string, now: Date = new Date()): string {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The CSS class carrying a state's colour.
 *
 * Every component asks this rather than choosing a colour, which is what makes
 * green mean one thing across the whole console. An unrecognised state is
 * `unobserved` (slate) and never `healthy`: painting a state the interface does
 * not understand as one it has verified is fine is how an outage reads as an
 * all-clear.
 */
export function stateClass(state: string): string {
  switch (state) {
    case "HEALTHY":
      return "state-healthy";
    case "DEGRADED":
      return "state-degraded";
    case "DOWN":
      return "state-down";
    default:
      return "state-unobserved";
  }
}
