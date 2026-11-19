"use client";

import Link from "next/link";
import { Copy, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { toast } from "sonner";
import type { ServerSoftware, ServerState } from "@/generated/prisma/client";
import { SOFTWARE } from "@loadstone/shared";
import { formatCores, formatMb } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, StatusDot } from "@/components/ui/badge";
import { stateMeta } from "./state";
import { SoftwareTile } from "./software-icon";

export interface ServerCardData {
  id: string;
  name: string;
  software: ServerSoftware;
  mcVersion: string;
  memoryMb: number;
  cpuPercent: number;
  diskMb: number;
  port: number;
  state: ServerState;
  node: { name: string; publicHost: string };
}

export function ServerCard({ server: s }: { server: ServerCardData }) {
  const meta = stateMeta(s.state);
  const def = SOFTWARE[s.software];
  const address = `${s.node.publicHost}:${s.port}`;
  const live = s.state === "RUNNING";

  return (
    <Link
      href={`/servers/${s.id}`}
      className="surface surface-interactive group relative flex flex-col overflow-hidden rounded-xl hover:-translate-y-0.5"
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-16 size-40 rounded-full blur-3xl transition-opacity duration-500",
          live ? "bg-success opacity-[0.1]" : "bg-primary opacity-0 group-hover:opacity-[0.08]",
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-70" />
      <div className="relative flex items-start gap-3 p-4 pb-3">
        <SoftwareTile software={s.software} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[-0.01em]">{s.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {def.label}
            {def.usesMinecraftVersion && <span className="text-subtle"> · {s.mcVersion === "LATEST" ? "Latest" : s.mcVersion}</span>}
          </div>
        </div>
        <Badge tone={meta.tone}>
          <StatusDot tone={meta.tone} pulse={meta.pulse} className="size-1.5" />
          {meta.label}
        </Badge>
      </div>

      <div className="relative px-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            void navigator.clipboard.writeText(address);
            toast.success("Address copied", { description: address });
          }}
          className="group/addr flex w-full items-center justify-between rounded-lg border border-border bg-surface-2/70 px-2.5 py-1.5 font-mono text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground dark:bg-white/[0.03]"
        >
          <span className="truncate">{address}</span>
          <Copy className="size-3 opacity-50 group-hover/addr:opacity-100" />
        </button>
      </div>

      <div className="relative mt-3 grid grid-cols-3 divide-x divide-border border-t border-border bg-surface-2/40 text-xs dark:bg-white/[0.015]">
        <Metric icon={MemoryStick} label="RAM" value={formatMb(s.memoryMb)} />
        <Metric icon={Cpu} label="CPU" value={formatCores(s.cpuPercent, "∞")} />
        <Metric icon={HardDrive} label="Disk" value={formatMb(s.diskMb)} />
      </div>
    </Link>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5">
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.06em] text-subtle">
        <Icon className="size-3" />
        {label}
      </span>
      <span className="font-medium tabular text-foreground">{value}</span>
    </div>
  );
}
