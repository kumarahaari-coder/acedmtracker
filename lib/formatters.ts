/**
 * Deterministic Date & Time Formatters for Consistent SSR/Client Hydration
 * Uses explicit 'en-GB' locale and fixed 'Asia/Kolkata' timezone.
 */

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

export function formatDate(dateVal: string | number | Date | null | undefined): string {
  if (!dateVal) return "Unset";
  try {
    const d = typeof dateVal === "string" || typeof dateVal === "number" ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return "Invalid Date";
    return dateFormatter.format(d);
  } catch {
    return "Invalid Date";
  }
}

export function formatTime(dateVal: string | number | Date | null | undefined): string {
  if (!dateVal) return "";
  try {
    const d = typeof dateVal === "string" || typeof dateVal === "number" ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return "";
    return timeFormatter.format(d);
  } catch {
    return "";
  }
}

export function formatDateTime(dateVal: string | number | Date | null | undefined): string {
  if (!dateVal) return "Unset";
  try {
    const d = typeof dateVal === "string" || typeof dateVal === "number" ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return "Invalid Date";
    return dateTimeFormatter.format(d);
  } catch {
    return "Invalid Date";
  }
}

export function formatDurationHuman(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds === 0) {
    return "0m";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

