"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Copy, LayoutGrid, List, Plus, Search, Server } from "lucide-react";
import { toast } from "sonner";
import type { ServerSoftware, ServerState } from "@/generated/prisma/client";
import { SOFTWARE } from "@loadstone/shared";
import { formatCores, formatMb } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { stateMeta } from "./state";
import { SoftwareTile } from "./software-icon";
import { ServerCard } from "./server-card";

export interface ServerRow {
  id: string;
  name: string;
  software: ServerSoftware;
  mcVersion: string;
  memoryMb: number;
  cpuPercent: number;
  diskMb: number;
  port: number;
  state: ServerState;
  node: { id: string; name: string; publicHost: string };
  owner: { id: string; name: string };
}

const VIEW_KEY = "loadstone:servers-view";

export function ServersTable({ initial, canCreate }: { initial: ServerRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { data } = useSWR<{ servers: ServerRow[] }>("/api/servers", { fallbackData: { servers: initial }, refreshInterval: 5000 });
  const servers = data?.servers ?? initial;

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);
  const changeView = (v: "grid" | "list") => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((s) => {
      if (filter === "running" && s.state !== "RUNNING") return false;
      if (filter === "stopped" && s.state !== "OFFLINE") return false;
      if (filter === "issues" && s.state !== "ERROR") return false;
      return !q || s.name.toLowerCase().includes(q) || s.node.name.toLowerCase().includes(q) || SOFTWARE[s.software].label.toLowerCase().includes(q);
    });
  }, [servers, query, filter]);

  if (servers.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Server}
          title="No servers yet"
          description={canCreate ? "Spin up your first Minecraft server in under a minute." : "No servers have been assigned to you yet."}
          action={
            canCreate && (
              <Button variant="primary" asChild>
                <Link href="/servers/new">
                  <Plus /> Create server
                </Link>
              </Button>
            )
          }
        />
      </Card>
    );
  }

  const filters = [
    { value: "all", label: "All", count: servers.length },
    { value: "running", label: "Running", count: servers.filter((x) => x.state === "RUNNING").length },
    { value: "stopped", label: "Stopped", count: servers.filter((x) => x.state === "OFFLINE").length },
    { value: "issues", label: "Errors", count: servers.filter((x) => x.state === "ERROR").length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, node or software…" className="pl-8.5" />
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {filters.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
                <span className="tabular text-subtle">{f.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center rounded-lg border border-border bg-surface-2/60 p-1">
          {(
            [
              ["grid", LayoutGrid],
              ["list", List],
            ] as const
          ).map(([v, Icon]) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              aria-label={v === "grid" ? "Grid view" : "List view"}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors",
                view === v ? "bg-surface text-foreground shadow-soft" : "text-subtle hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No matching servers" description="Try a different search or filter." />
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <ServerCard key={s.id} server={s} />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Address</Th>
                <Th className="hidden md:table-cell">Node</Th>
                <Th className="hidden lg:table-cell">Resources</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const meta = stateMeta(s.state);
                const address = `${s.node.publicHost}:${s.port}`;
                return (
                  <Tr key={s.id} className="cursor-pointer" onClick={() => router.push(`/servers/${s.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <SoftwareTile software={s.software} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.name}</div>
                          <div className="text-xs text-muted">
                            {SOFTWARE[s.software].label}
                            {SOFTWARE[s.software].usesMinecraftVersion && ` · ${s.mcVersion}`}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <button
                        className="group inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard.writeText(address);
                          toast.success("Address copied");
                        }}
                      >
                        {address}
                        <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </Td>
                    <Td className="hidden text-muted md:table-cell">{s.node.name}</Td>
                    <Td className="hidden text-xs text-muted tabular lg:table-cell">
                      {formatMb(s.memoryMb)} · {formatCores(s.cpuPercent, "∞ CPU")} · {formatMb(s.diskMb)}
                    </Td>
                    <Td className="text-right">
                      <Badge tone={meta.tone}>
                        <StatusDot tone={meta.tone} pulse={meta.pulse} className="size-1.5" />
                        {meta.label}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
