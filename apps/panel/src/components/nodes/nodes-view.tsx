"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boxes, Plus } from "lucide-react";
import { formatBytes, formatMb, timeAgo } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { Progress } from "@/components/ui/misc";
import { compareVersions, PANEL_VERSION } from "@loadstone/shared";
import { cn, usageTone } from "@/lib/utils";
import { NodeFormDialog, TokenDialog } from "./node-form";

export interface NodeRow {
  id: string;
  name: string;
  description: string | null;
  scheme: string;
  host: string;
  port: number;
  publicHost: string;
  memoryMb: number;
  diskMb: number;
  portRangeStart: number;
  portRangeEnd: number;
  extraPorts: number[];
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  lastSeenAt: string | null;
  lastError: string | null;
  agentVersion: string | null;
  platform: string | null;
  cpuModel: string | null;
  cpuCount: number | null;
  cpuPercent: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  allocatedMemoryMb: number;
  allocatedDiskMb: number;
  serverCount: number;
}

export function statusTone(status: NodeRow["status"]) {
  return status === "ONLINE" ? "success" : status === "OFFLINE" ? "danger" : "neutral";
}

export function NodesView({ initial, agentImage }: { initial: NodeRow[]; agentImage: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<{ token: string; nodeId: string } | null>(null);

  return (
    <>
      <PageHeader
        title="Nodes"
        description="Docker hosts running the Loadstone agent."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus /> Add node
          </Button>
        }
      />
      {initial.length === 0 ? (
        <Card>
          <EmptyState
            icon={Boxes}
            title="No nodes registered"
            description="A node is any machine with Docker where the Loadstone agent runs. Add one to start hosting servers."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> Add node
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {initial.map((n) => {
            const memPct = n.memoryTotalBytes ? ((n.memoryUsedBytes ?? 0) / n.memoryTotalBytes) * 100 : 0;
            const diskPct = n.diskTotalBytes ? ((n.diskUsedBytes ?? 0) / n.diskTotalBytes) * 100 : 0;
            const allocPct = (n.allocatedMemoryMb / n.memoryMb) * 100;
            return (
              <Link key={n.id} href={`/nodes/${n.id}`} className="group">
                <Card className="p-4 transition-colors group-hover:border-border-strong">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusDot tone={statusTone(n.status)} pulse={n.status === "ONLINE"} />
                        <span className="truncate text-[13px] font-medium">{n.name}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted">
                        {n.scheme}://{n.host}:{n.port}
                      </div>
                    </div>
                    <Badge tone={statusTone(n.status)}>{n.status.toLowerCase()}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <Meter label="CPU" value={`${(n.cpuPercent ?? 0).toFixed(0)}%`} pct={n.cpuPercent ?? 0} />
                    <Meter label="Memory" value={formatBytes(n.memoryUsedBytes)} pct={memPct} />
                    <Meter label="Disk" value={formatBytes(n.diskUsedBytes)} pct={diskPct} />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                    <span>
                      {n.serverCount} server{n.serverCount === 1 ? "" : "s"} · {formatMb(n.allocatedMemoryMb)} / {formatMb(n.memoryMb)} allocated ({allocPct.toFixed(0)}%)
                    </span>
                    <span className={cn(n.status === "ONLINE" && n.agentVersion && compareVersions(n.agentVersion, PANEL_VERSION) < 0 && "text-warning")}>
                      {n.status === "ONLINE"
                        ? `v${n.agentVersion}${n.agentVersion && compareVersions(n.agentVersion, PANEL_VERSION) < 0 ? ` (update to v${PANEL_VERSION})` : ""}`
                        : `seen ${timeAgo(n.lastSeenAt)}`}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <NodeFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(res) => {
          if (res.token) setToken({ token: res.token, nodeId: res.id });
          router.refresh();
        }}
      />
      {token && <TokenDialog token={token.token} nodeId={token.nodeId} agentImage={agentImage} onClose={() => setToken(null)} />}
    </>
  );
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular">{value}</span>
      </div>
      <Progress value={pct} tone={usageTone(pct)} />
    </div>
  );
}
