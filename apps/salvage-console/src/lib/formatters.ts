export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function formatRupeesDetailed(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatISTTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-IN", {
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

export function getHealthColorClass(state: string): { bg: string; text: string; border: string; dot: string } {
  switch (state) {
    case "HEALTHY":
      return {
        bg: "bg-emerald-950/40",
        text: "text-emerald-400",
        border: "border-emerald-800/40",
        dot: "bg-emerald-500",
      };
    case "DEGRADED":
      return {
        bg: "bg-amber-950/40",
        text: "text-amber-400",
        border: "border-amber-800/40",
        dot: "bg-amber-500",
      };
    case "DOWN":
      return {
        bg: "bg-rose-950/40",
        text: "text-rose-400",
        border: "border-rose-800/40",
        dot: "bg-rose-500",
      };
    default:
      return {
        bg: "bg-slate-900",
        text: "text-slate-400",
        border: "border-slate-800",
        dot: "bg-slate-500",
      };
  }
}
