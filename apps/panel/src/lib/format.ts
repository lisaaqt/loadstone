export function formatBytes(bytes: number | bigint | null | undefined, decimals = 1): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const n = value / 1024 ** i;
  return `${n.toFixed(i === 0 ? 0 : n >= 100 ? 0 : decimals)} ${units[i]}`;
}

export function formatMb(mb: number): string {
  return formatBytes(mb * 1024 * 1024);
}

/** CPU is stored as a percentage of one core (100 = 1 core, 0 = unlimited). */
export function percentToCores(percent: number): number {
  return Math.round((percent / 100) * 100) / 100;
}

export function coresToPercent(cores: number): number {
  return Math.max(0, Math.round(cores * 100));
}

export function formatCores(percent: number | null | undefined, unlimited = "Unlimited"): string {
  if (!percent) return unlimited;
  const cores = percentToCores(percent);
  return `${cores} ${cores === 1 ? "core" : "cores"}`;
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  return `${Number(value ?? 0).toFixed(decimals)}%`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30)), "month");
  return rtf.format(Math.round(seconds / (86400 * 365)), "year");
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
