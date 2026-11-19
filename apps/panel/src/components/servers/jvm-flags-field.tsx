"use client";

import { Check, Zap } from "lucide-react";
import { detectPreset, jvmFlagsFor, presetsFor, type JvmPresetId } from "@loadstone/shared";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/misc";

interface Props {
  value: string;
  onChange: (value: string) => void;
  memoryMb: number;
  javaVersion: string;
  proxy?: boolean;
}

export function JvmFlagsField({ value, onChange, memoryMb, javaVersion, proxy = false }: Props) {
  const opts = { memoryMb, javaVersion };
  const active = detectPreset(value, opts);
  const presets = presetsFor({ javaVersion, proxy });

  const select = (id: JvmPresetId | null) => onChange(id ? jvmFlagsFor(id, opts) : "");

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <PresetCard label="Default" description="No extra flags. The image's built-in defaults apply." active={!value.trim()} onClick={() => select(null)} />
        {presets.map((p) => {
          const card = (
            <PresetCard
              key={p.id}
              label={p.label}
              description={p.description}
              active={active === p.id}
              disabled={!p.available}
              recommended={p.id === (proxy ? "velocity" : "aikar")}
              onClick={() => select(p.id)}
            />
          );
          return p.reason ? (
            <Tooltip key={p.id} content={p.reason}>
              <div>{card}</div>
            </Tooltip>
          ) : (
            card
          );
        })}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=200"
        className="font-mono text-[11.5px] leading-relaxed"
      />
      <p className="text-xs text-muted">
        {active ? "Preset applied. Editing the flags turns it into a custom set." : value.trim() ? "Custom flags." : "Heap size (-Xms/-Xmx) is set from the memory allocation."}
      </p>
    </div>
  );
}

function PresetCard({
  label,
  description,
  active,
  disabled,
  recommended,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group relative flex h-full w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        active ? "border-primary/60 bg-primary-soft shadow-[0_0_0_3px_var(--primary-soft)]" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span className="flex w-full items-center gap-1.5 text-[13px] font-medium">
        {label}
        {recommended && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
            <Zap className="size-2.5" /> Recommended
          </span>
        )}
        {active && <Check className="ml-auto size-3.5 text-primary" />}
      </span>
      <span className="text-xs leading-snug text-muted">{description}</span>
    </button>
  );
}
