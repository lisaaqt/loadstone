"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Copy,
  Database,
  FolderOpen,
  Globe,
  LayoutGrid,
  LoaderCircle,
  MemoryStick,
  Network,
  Play,
  Puzzle,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Skull,
  Square,
  Terminal,
  Timer,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { PowerAction } from "@loadstone/shared";
import { SOFTWARE } from "@loadstone/shared";
import { api, errorMessage } from "@/lib/client";
import { formatMb } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/misc";
import { stateMeta } from "./state";
import { SoftwareTile } from "./software-icon";
import { ServerContext, useServerStatus, type ServerInfo } from "./use-server";

const TABS = [
  { href: "", label: "Overview", icon: LayoutGrid },
  { href: "/console", label: "Console", icon: Terminal },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/worlds", label: "Worlds", icon: Globe, noProxy: true },
  { href: "/backups", label: "Backups", icon: Archive },
  { href: "/plugins", label: "Plugins & Mods", icon: Puzzle },
  { href: "/players", label: "Players", icon: Users, noProxy: true },
  { href: "/configuration", label: "Configuration", icon: SlidersHorizontal },
  { href: "/schedules", label: "Schedules", icon: Timer },
  { href: "/databases", label: "Databases", icon: Database },
  { href: "/network", label: "Network", icon: Network, proxyOnly: true },
  { href: "/members", label: "Members", icon: UserPlus, manage: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const LOCK_COPY: Partial<Record<ServerInfo["state"], { title: string; text: string }>> = {
  INSTALLING: {
    title: "Server is currently being installed",
    text: "Loadstone is preparing the server files and container. The dashboard unlocks as soon as it's ready.",
  },
  RESTORING: {
    title: "A backup is currently being restored",
    text: "The server files are being replaced with the backup. The dashboard unlocks when the restore finishes.",
  },
};

export function ServerShell({ server, children }: { server: ServerInfo; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/servers/${server.id}`;
  const { data, mutate } = useServerStatus(server.id, server.state);
  const state = data?.state ?? server.state;
  const meta = stateMeta(state);
  const live: ServerInfo = { ...server, state, installError: data?.error && state === "ERROR" ? data.error : server.installError };
  const def = SOFTWARE[server.software];
  const lock = LOCK_COPY[state];
  const wasLocked = useRef(Boolean(lock));

  // Reload page data once an install or restore finishes, so the unlocked tabs show fresh content.
  useEffect(() => {
    if (wasLocked.current && !lock) router.refresh();
    wasLocked.current = Boolean(lock);
  }, [lock, router]);

  return (
    <ServerContext.Provider value={live}>
      <div className="relative overflow-hidden border-b border-border bg-sidebar/60 dark:bg-transparent">
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
        <div
          className={cn(
            "pointer-events-none absolute -top-28 left-0 h-64 w-[40rem] rounded-full blur-3xl transition-colors duration-700",
            state === "RUNNING" ? "bg-success/[0.12]" : state === "ERROR" ? "bg-danger/[0.12]" : "bg-primary/[0.12]",
          )}
        />
        <div className="relative mx-auto w-full max-w-[1440px] px-5 pt-8 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <SoftwareTile software={server.software} size="lg" className="bg-surface shadow-soft dark:bg-transparent" />
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="truncate text-[22px] font-semibold tracking-[-0.03em]">{server.name}</h1>
                  <Badge tone={meta.tone}>
                    <StatusDot tone={meta.tone} pulse={meta.pulse} className="size-1.5" />
                    {meta.label}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 py-1 font-mono text-foreground shadow-soft transition-colors hover:border-primary/40 dark:bg-white/[0.04] dark:shadow-none"
                    onClick={() => {
                      void navigator.clipboard.writeText(server.address);
                      toast.success("Address copied", { description: server.address });
                    }}
                  >
                    {server.address} <Copy className="size-3" />
                  </button>
                  <Chip>
                    {def.label}
                    {def.usesMinecraftVersion ? ` ${server.mcVersion === "LATEST" ? "Latest" : server.mcVersion}` : ""}
                  </Chip>
                  <Chip icon={MemoryStick}>{formatMb(server.memoryMb)}</Chip>
                  <Chip icon={Network}>{server.nodeName}</Chip>
                </div>
              </div>
            </div>
            <PowerControls id={server.id} state={state} onChange={() => void mutate()} />
          </div>
          <nav className="scrollbar-none mt-7 mb-4 flex w-fit max-w-full gap-0.5 overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-surface/70 p-1 shadow-soft backdrop-blur dark:bg-white/[0.03] dark:shadow-none">
            {TABS.filter((tab) => (!tab.manage || server.canManage) && (!tab.proxyOnly || def.category === "proxy") && (!tab.noProxy || def.category !== "proxy")).map((tab) => {
              const href = `${base}${tab.href}`;
              const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
              return (
                <Link
                  key={tab.href}
                  href={href}
                  className={cn(
                    "group flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors",
                    active
                      ? "bg-primary-soft font-medium text-foreground ring-1 ring-primary/20"
                      : "text-muted hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <tab.icon className={cn("size-3.5 transition-colors", active ? "text-primary dark:text-primary-strong" : "text-subtle group-hover:text-muted")} />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div key={pathname} className="mx-auto w-full max-w-[1440px] animate-slide-up px-5 py-7 md:px-8">
        {lock && !pathname.endsWith("/console") ? (
          <div className="surface relative flex flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-20 text-center">
            <div className="pointer-events-none absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative mb-5 flex size-16 items-center justify-center rounded-2xl border border-border-strong bg-surface shadow-pop dark:bg-surface-2">
              <LoaderCircle className="size-7 animate-spin text-primary dark:text-primary-strong" />
            </div>
            <h2 className="relative text-lg font-semibold tracking-[-0.02em]">{lock.title}</h2>
            <p className="relative mt-2 max-w-md text-[13px] leading-relaxed text-muted">{lock.text}</p>
            <Link href={`${base}/console`} className="relative mt-5 text-xs font-medium text-primary hover:underline dark:text-primary-strong">
              Follow progress in the console
            </Link>
          </div>
        ) : (
          children
        )}
      </div>
    </ServerContext.Provider>
  );
}

function Chip({ icon: Icon, children }: { icon?: typeof Copy; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface/80 px-2 py-1 dark:bg-white/[0.03]">
      {Icon && <Icon className="size-3 text-subtle" />}
      {children}
    </span>
  );
}

function PowerControls({ id, state, onChange }: { id: string; state: ServerInfo["state"]; onChange: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState<PowerAction | null>(null);

  async function power(action: PowerAction) {
    setPending(action);
    try {
      await api(`/api/servers/${id}/power`, { body: { action } });
      onChange();
      router.refresh();
    } catch (err) {
      toast.error(`Could not ${action} server`, { description: errorMessage(err) });
    } finally {
      setPending(null);
    }
  }

  const busy = state === "INSTALLING" || state === "RESTORING" || pending !== null;
  const running = state === "RUNNING" || state === "STARTING";
  return (
    <div className="flex items-center gap-1.5">
      {!running && state !== "STOPPING" ? (
        <Button variant="primary" onClick={() => power("start")} loading={pending === "start"} disabled={busy}>
          <Play /> Start
        </Button>
      ) : (
        <>
          <Button onClick={() => power("restart")} loading={pending === "restart"} disabled={busy}>
            <RotateCw /> Restart
          </Button>
          <Button onClick={() => power("stop")} loading={pending === "stop"} disabled={busy || state === "STOPPING"}>
            <Square /> Stop
          </Button>
        </>
      )}
      {(running || state === "STOPPING") && (
        <Tooltip content="Force kill">
          <Button variant="danger-outline" size="icon" onClick={() => power("kill")} disabled={busy} aria-label="Kill">
            <Skull />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
