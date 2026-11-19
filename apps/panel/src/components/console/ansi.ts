export interface Segment {
  text: string;
  color?: string;
  bold?: boolean;
}

const COLORS: Record<number, string> = {
  30: "#6b6b76", 31: "#f2555f", 32: "#3ccf7e", 33: "#e8a83a", 34: "#5ea2f5", 35: "#b48cf7", 36: "#4fd1d9", 37: "#d4d4db",
  90: "#8c8c97", 91: "#ff7b84", 92: "#6ee7a5", 93: "#f5c869", 94: "#8bbcff", 95: "#d0b0ff", 96: "#7ee6ec", 97: "#ffffff",
};

const MC_COLORS: Record<string, string> = {
  "0": "#6b6b76", "1": "#5e6af5", "2": "#3ccf7e", "3": "#4fd1d9", "4": "#f2555f", "5": "#b48cf7", "6": "#e8a83a", "7": "#d4d4db",
  "8": "#8c8c97", "9": "#8bbcff", a: "#6ee7a5", b: "#7ee6ec", c: "#ff7b84", d: "#d0b0ff", e: "#f5c869", f: "#ffffff",
};

const SGR = /\x1b\[([0-9;]*)m/g;

export function parseAnsi(input: string): Segment[] {
  const line = input.replace(/\x1b\[[0-9;?]*[A-HJKSTfhlnsu]/g, "").replace(/\r/g, "");
  const segments: Segment[] = [];
  let color: string | undefined;
  let bold = false;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    for (const part of splitMinecraft(text, color)) segments.push({ ...part, bold: part.bold || bold });
  };
  for (const match of line.matchAll(SGR)) {
    push(line.slice(last, match.index));
    last = (match.index ?? 0) + match[0].length;
    const codes = (match[1] || "0").split(";").map(Number);
    for (const c of codes) {
      if (c === 0) {
        color = undefined;
        bold = false;
      } else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c === 39) color = undefined;
      else if (COLORS[c]) color = COLORS[c];
    }
  }
  push(line.slice(last));
  return segments;
}

function splitMinecraft(text: string, base?: string): Segment[] {
  if (!text.includes("§")) return [{ text, color: base }];
  const out: Segment[] = [];
  let color = base;
  let bold = false;
  const parts = text.split("§");
  if (parts[0]) out.push({ text: parts[0], color });
  for (const part of parts.slice(1)) {
    const code = part[0]?.toLowerCase();
    if (code && MC_COLORS[code]) {
      color = MC_COLORS[code];
      bold = false;
    } else if (code === "l") bold = true;
    else if (code === "r") {
      color = base;
      bold = false;
    }
    const rest = part.slice(1);
    if (rest) out.push({ text: rest, color, bold });
  }
  return out;
}

export type LogLevel = "error" | "warn" | "info" | "debug" | "command" | "system";

export function detectLevel(line: string): LogLevel {
  if (line.startsWith("> ")) return "command";
  if (line.startsWith("[Loadstone]")) return "system";
  const head = line.slice(0, 160);
  if (/\b(ERROR|SEVERE|FATAL)\b/.test(head) || /^\s+at |Exception:|^Caused by:/.test(line)) return "error";
  if (/\bWARN(ING)?\b/.test(head)) return "warn";
  if (/\bDEBUG\b|\bTRACE\b/.test(head)) return "debug";
  return "info";
}
