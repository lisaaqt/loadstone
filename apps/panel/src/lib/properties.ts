export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const idx = line.search(/[=:]/);
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

export function updateProperties(text: string, updates: Record<string, string>): string {
  const pending = new Map(Object.entries(updates));
  const lines = text.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return raw;
    const idx = line.search(/[=:]/);
    if (idx === -1) return raw;
    const key = line.slice(0, idx).trim();
    if (!pending.has(key)) return raw;
    const value = pending.get(key)!;
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const [k, v] of pending) lines.push(`${k}=${v}`);
  return `${lines.join("\n")}\n`;
}

export function sanitizePropertyValue(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}
