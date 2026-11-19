"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useState } from "react";
import { ChevronRight, KeyRound, Pencil, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ServerSoftware, ServerState } from "@/generated/prisma/client";
import { compareVersions, PANEL_VERSION, SOFTWARE } from "@loadstone/shared";
import { api, errorMessage } from "@/lib/client";
import { formatBytes, formatDate, formatMb, timeAgo } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { KeyValue, Table, Td, Th, Tr } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/dialog";
import { AreaChart } from "@/components/charts/area-chart";
import { stateMeta } from "@/components/servers/state";
import { NodeFormDialog, TokenDialog } from "./node-form";
import { statusTone, type NodeRow } from "./nodes-view";

type Node = Omit<NodeRow, "allocatedMemoryMb" | "allocatedDiskMb" | "serverCount">;

interface Metric {
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  createdAt: string;
}

export function NodeDetail({
  node,
  metrics,
  servers,
  agentImage,
}: {
  agentImage: string;
  node: Node;
  metrics: Metric[];
  servers: { id: string; name: string; state: ServerState; port: number; memoryMb: number; diskMb: number; software: ServerSoftware }[];
}) {
  const router = useRouter();
  const { data: update } = useSWR<{ latest: string | null; outdated: boolean }>("/api/meta/update", { revalidateOnFocus: false, shouldRetryOnError: false });
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"rotate" | "delete" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const series = (fn: (m: Metric) => number) => metrics.map((m) => ({ t: new Date(m.createdAt).getTime(), v: fn(m) }));
  const allocMem = servers.reduce((s, v) => s + v.memoryMb, 0);
  const allocDisk = servers.reduce((s, v) => s + v.diskMb, 0);

  async function test() {
    setBusy("test");
    try {
      const res = await api<{ ok: boolean; error?: string }>(`/api/nodes/${node.id}?action=test`, { method: "POST" });
      if (res.ok) toast.success("Agent is reachable");
      else toast.error("Agent unreachable", { description: res.error });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        <Link href="/nodes" className="hover:text-foreground">
          Nodes
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{node.name}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{node.name}</h1>
            <Badge tone={statusTone(node.status)}>
              <StatusDot tone={statusTone(node.status)} className="size-1.5" />
              {node.status.toLowerCase()}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted">
            {node.scheme}://{node.host}:{node.port}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button onClick={test} loading={busy === "test"}>
            <PlugZap /> Test connection
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <Button onClick={() => setConfirm("rotate")}>
            <KeyRound /> Rotate token
          </Button>
          <Button variant="danger-outline" size="icon" onClick={() => setConfirm("delete")} aria-label="Delete node">
            <Trash2 />
          </Button>
        </div>
      </div>

      {node.status === "OFFLINE" && node.lastError && (
        <div className="mb-3 rounded-lg border border-danger/25 bg-danger/10 px-4 py-2.5 text-[13px] text-muted">
          <span className="font-medium text-danger">Unreachable:</span> {node.lastError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="CPU" description="Last 24 hours" />
          <div className="p-4">
            <AreaChart data={series((m) => m.cpuPercent)} max={100} unit="percent" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Memory" description={formatBytes(node.memoryTotalBytes)} />
          <div className="p-4">
            <AreaChart data={series((m) => m.memoryUsedBytes)} max={node.memoryTotalBytes ?? undefined} unit="bytes" color="var(--info)" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Disk" description={formatBytes(node.diskTotalBytes)} />
          <div className="p-4">
            <AreaChart data={series((m) => m.diskUsedBytes)} max={node.diskTotalBytes ?? undefined} unit="bytes" color="var(--success)" />
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="System" />
          <div className="divide-y divide-border px-4 py-1">
            <KeyValue label="Agent">
              {node.agentVersion ? `v${node.agentVersion}` : "—"}
              {node.agentVersion && compareVersions(node.agentVersion, PANEL_VERSION) < 0 && (
                <span className="ml-2 text-xs text-warning">update to v{PANEL_VERSION}</span>
              )}
            </KeyValue>
            <KeyValue label="Panel">
              v{PANEL_VERSION}
              {update?.outdated && <span className="ml-2 text-xs text-warning">v{update.latest} available</span>}
            </KeyValue>
            <KeyValue label="Platform">{node.platform ?? "—"}</KeyValue>
            <KeyValue label="CPU">{node.cpuModel ? `${node.cpuCount}× ${node.cpuModel}` : "—"}</KeyValue>
            <KeyValue label="Public address" mono>
              {node.publicHost}
            </KeyValue>
            <KeyValue label="Port range" mono>
              {node.portRangeStart}–{node.portRangeEnd}
              {node.extraPorts.length > 0 && `, ${node.extraPorts.join(", ")}`}
            </KeyValue>
            <KeyValue label="Allocated RAM">
              {formatMb(allocMem)} / {formatMb(node.memoryMb)}
            </KeyValue>
            <KeyValue label="Allocated disk">
              {formatMb(allocDisk)} / {formatMb(node.diskMb)}
            </KeyValue>
            <KeyValue label="Last seen">
              <span title={formatDate(node.lastSeenAt)}>{timeAgo(node.lastSeenAt)}</span>
            </KeyValue>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Servers" description={`${servers.length} on this node`} />
          {servers.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted">No servers are allocated to this node.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Software</Th>
                  <Th>Port</Th>
                  <Th>Memory</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => {
                  const meta = stateMeta(s.state);
                  return (
                    <Tr key={s.id} className="cursor-pointer" onClick={() => router.push(`/servers/${s.id}`)}>
                      <Td className="font-medium">{s.name}</Td>
                      <Td className="text-muted">{SOFTWARE[s.software].label}</Td>
                      <Td className="font-mono text-xs text-muted">{s.port}</Td>
                      <Td className="text-muted tabular">{formatMb(s.memoryMb)}</Td>
                      <Td className="text-right">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <NodeFormDialog
        open={editing}
        onOpenChange={setEditing}
        nodeId={node.id}
        initial={{
          name: node.name,
          description: node.description ?? "",
          scheme: node.scheme as "http" | "https",
          host: node.host,
          port: node.port,
          publicHost: node.publicHost,
          memoryMb: node.memoryMb,
          diskMb: node.diskMb,
          portRangeStart: node.portRangeStart,
          portRangeEnd: node.portRangeEnd,
          extraPorts: node.extraPorts,
        }}
        onSaved={() => router.refresh()}
      />
      {token && <TokenDialog token={token} nodeId={node.id} agentImage={agentImage} onClose={() => setToken(null)} />}
      <ConfirmDialog
        open={confirm === "rotate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Rotate agent token?"
        description="The current token stops working immediately. You must restart the agent with the new token."
        confirmLabel="Rotate token"
        loading={busy === "rotate"}
        onConfirm={async () => {
          setBusy("rotate");
          try {
            const res = await api<{ token: string }>(`/api/nodes/${node.id}?action=rotate-token`, { method: "POST" });
            setConfirm(null);
            setToken(res.token);
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(null);
          }
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Remove ${node.name}?`}
        description={servers.length ? "This node still has servers. Delete them first." : "The node is removed from the panel. The agent and its data on the host are left untouched."}
        confirmLabel="Remove node"
        destructive
        loading={busy === "delete"}
        onConfirm={async () => {
          setBusy("delete");
          try {
            await api(`/api/nodes/${node.id}`, { method: "DELETE" });
            toast.success("Node removed");
            router.push("/nodes");
            router.refresh();
          } catch (err) {
            toast.error(errorMessage(err));
            setBusy(null);
          }
        }}
      />
    </>
  );
}
