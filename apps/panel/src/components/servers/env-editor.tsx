"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EnvRow = { key: string; value: string };

export function envToRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

export function rowsToEnv(rows: EnvRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]));
}

export function EnvEditor({ rows, onChange, disabled }: { rows: EnvRow[]; onChange: (rows: EnvRow[]) => void; disabled?: boolean }) {
  const update = (i: number, patch: Partial<EnvRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-xs text-muted">No custom environment variables.</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.key}
            disabled={disabled}
            onChange={(e) => update(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
            placeholder="KEY"
            className="w-2/5 font-mono text-xs"
          />
          <Input value={row.value} disabled={disabled} onChange={(e) => update(i, { value: e.target.value })} placeholder="value" className="flex-1 font-mono text-xs" />
          <Button variant="ghost" size="icon" disabled={disabled} onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove variable">
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...rows, { key: "", value: "" }])}>
          <Plus /> Add variable
        </Button>
      </div>
    </div>
  );
}
