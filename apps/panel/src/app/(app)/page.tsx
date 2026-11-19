import Link from "next/link";
import type { Metadata } from "next";
import { Archive, ArrowUpRight, Boxes, Cpu, HardDrive, MemoryStick, Plus, Server } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serverScope } from "@/lib/access";
import { formatBytes, formatMb, timeAgo } from "@/lib/format";
import { usageTone } from "@/lib/utils";
import { PageContainer } from "@/components/shell/page";
import { EmptyState, PageHeader, Stat } from "@/components/ui/layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { AreaChart } from "@/components/charts/area-chart";
import { ActivityList } from "@/components/activity/activity-list";
import { ServerCard } from "@/components/servers/server-card";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

function bucketize(rows: { createdAt: Date; nodeId: string; value: number }[], bucketMs: number, mode: "avg" | "sum") {
  const buckets = new Map<number, Map<string, number[]>>();
  for (const r of rows) {
    const b = Math.floor(r.createdAt.getTime() / bucketMs) * bucketMs;
    const perNode = buckets.get(b) ?? new Map<string, number[]>();
    perNode.set(r.nodeId, [...(perNode.get(r.nodeId) ?? []), r.value]);
    buckets.set(b, perNode);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, perNode]) => {
      const nodeAvgs = [...perNode.values()].map((vs) => vs.reduce((s, v) => s + v, 0) / vs.length);
      const sum = nodeAvgs.reduce((s, v) => s + v, 0);
      return { t, v: mode === "sum" ? sum : sum / nodeAvgs.length };
    });
}

function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href={href}>
        {label} <ArrowUpRight />
      </Link>
    </Button>
  );
}

export default async function OverviewPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const scope = serverScope(user);
  const since = new Date(Date.now() - 24 * 3600_000);

  const [servers, nodes, metrics, backupAgg, lastBackup, failedBackups, activity] = await Promise.all([
    db.server.findMany({ where: scope, include: { node: { select: { name: true, publicHost: true } } }, orderBy: { updatedAt: "desc" } }),
    isAdmin ? db.node.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { servers: true } } } }) : Promise.resolve([]),
    isAdmin ? db.nodeMetric.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    db.backup.aggregate({ where: { server: scope, status: "COMPLETED" }, _count: true, _sum: { sizeBytes: true } }),
    db.backup.findFirst({ where: { server: scope, status: "COMPLETED" }, orderBy: { completedAt: "desc" } }),
    db.backup.count({ where: { server: scope, status: "FAILED", createdAt: { gte: since } } }),
    db.activity.findMany({
      where: isAdmin ? {} : { OR: [{ userId: user.id }, { server: scope }] },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { id: true, name: true } }, server: { select: { id: true, name: true } } },
    }),
  ]);

  const running = servers.filter((s) => s.state === "RUNNING").length;
  const allocatedMem = servers.reduce((s, v) => s + v.memoryMb, 0);
  const allocatedDisk = servers.reduce((s, v) => s + v.diskMb, 0);
  const online = nodes.filter((n) => n.status === "ONLINE");
  const memTotal = online.reduce((s, n) => s + Number(n.memoryTotalBytes ?? 0), 0);
  const memUsed = online.reduce((s, n) => s + Number(n.memoryUsedBytes ?? 0), 0);
  const diskTotal = online.reduce((s, n) => s + Number(n.diskTotalBytes ?? 0), 0);
  const diskUsed = online.reduce((s, n) => s + Number(n.diskUsedBytes ?? 0), 0);
  const cpuAvg = online.length ? online.reduce((s, n) => s + (n.cpuPercent ?? 0), 0) / online.length : 0;

  const bucket = 10 * 60_000;
  const cpuSeries = bucketize(metrics.map((m) => ({ createdAt: m.createdAt, nodeId: m.nodeId, value: m.cpuPercent })), bucket, "avg");
  const memSeries = bucketize(metrics.map((m) => ({ createdAt: m.createdAt, nodeId: m.nodeId, value: Number(m.memoryUsedBytes) })), bucket, "sum");
  const diskSeries = bucketize(metrics.map((m) => ({ createdAt: m.createdAt, nodeId: m.nodeId, value: Number(m.diskUsedBytes) })), bucket, "sum");
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  const today = new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });

  return (
    <PageContainer>
      <PageHeader
        eyebrow={today}
        title={`Good ${greeting()}, ${user.name.split(" ")[0]}`}
        description={
          servers.length
            ? `${running} of ${servers.length} server${servers.length === 1 ? " is" : "s are"} online${isAdmin ? ` across ${online.length} node${online.length === 1 ? "" : "s"}` : ""}.`
            : "Here's what's happening across your infrastructure."
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Servers online" icon={Server} tone="success" value={`${running}/${servers.length}`} sub={`${formatMb(allocatedMem)} memory allocated`}>
          <Progress value={pct(running, servers.length)} tone="success" />
        </Stat>
        {isAdmin ? (
          <>
            <Stat label="CPU usage" icon={Cpu} value={`${cpuAvg.toFixed(1)}%`} sub="Average across online nodes">
              <AreaChart data={cpuSeries} max={100} unit="percent" height={40} sparkline />
            </Stat>
            <Stat label="Memory" icon={MemoryStick} tone="info" value={formatBytes(memUsed)} sub={`of ${formatBytes(memTotal)} · ${pct(memUsed, memTotal).toFixed(0)}% used`}>
              <AreaChart data={memSeries} max={memTotal || undefined} unit="bytes" height={40} color="var(--info)" sparkline />
            </Stat>
            <Stat label="Storage" icon={HardDrive} tone="warning" value={formatBytes(diskUsed)} sub={`of ${formatBytes(diskTotal)} · ${pct(diskUsed, diskTotal).toFixed(0)}% used`}>
              <AreaChart data={diskSeries} max={diskTotal || undefined} unit="bytes" height={40} color="var(--warning)" sparkline />
            </Stat>
          </>
        ) : (
          <>
            <Stat label="Allocated memory" icon={MemoryStick} tone="info" value={formatMb(allocatedMem)} sub="Across your servers" />
            <Stat label="Allocated storage" icon={HardDrive} tone="warning" value={formatMb(allocatedDisk)} sub="Across your servers" />
            <Stat label="Backups" icon={Archive} value={backupAgg._count} sub={formatBytes(Number(backupAgg._sum.sizeBytes ?? 0))} />
          </>
        )}
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.015em]">Servers</h2>
            <p className="mt-0.5 text-xs text-muted">Recently updated</p>
          </div>
          {servers.length > 0 && <ViewAll href="/servers" />}
        </div>
        {servers.length === 0 ? (
          <Card>
            <EmptyState
              icon={Server}
              title="No servers yet"
              description={isAdmin ? "Spin up your first Minecraft server in under a minute." : "An administrator hasn't assigned any servers to you yet."}
              action={
                isAdmin && (
                  <Button variant="primary" asChild>
                    <Link href="/servers/new">
                      <Plus /> Create server
                    </Link>
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {servers.slice(0, 6).map((s) => (
              <ServerCard key={s.id} server={s} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" description="Latest actions across the panel" actions={<ViewAll href="/activity" />} />
          <ActivityList items={activity} />
        </Card>

        <div className="flex flex-col gap-4">
          {isAdmin && (
            <Card>
              <CardHeader title="Nodes" icon={<Boxes />} actions={<ViewAll href="/nodes" label="Manage" />} />
              {nodes.length === 0 ? (
                <EmptyState icon={Boxes} title="No nodes" description="Register a node to start hosting servers." className="py-10" />
              ) : (
                <div className="divide-y divide-border">
                  {nodes.map((n) => {
                    const memPct = pct(Number(n.memoryUsedBytes ?? 0), Number(n.memoryTotalBytes ?? 0));
                    return (
                      <Link key={n.id} href={`/nodes/${n.id}`} className="block px-5 py-3 transition-colors hover:bg-surface-2/50">
                        <div className="flex items-center gap-2.5">
                          <StatusDot tone={n.status === "ONLINE" ? "success" : n.status === "OFFLINE" ? "danger" : "neutral"} pulse={n.status === "ONLINE"} />
                          <span className="flex-1 truncate text-[13px] font-medium">{n.name}</span>
                          <span className="text-xs text-muted tabular">
                            {n._count.servers} server{n._count.servers === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-3 pl-4.5">
                          <div>
                            <div className="mb-1 flex justify-between text-[10px] text-subtle">
                              <span>CPU</span>
                              <span className="tabular">{(n.cpuPercent ?? 0).toFixed(0)}%</span>
                            </div>
                            <Progress value={n.cpuPercent ?? 0} tone={usageTone(n.cpuPercent ?? 0)} className="h-1" />
                          </div>
                          <div>
                            <div className="mb-1 flex justify-between text-[10px] text-subtle">
                              <span>Memory</span>
                              <span className="tabular">{memPct.toFixed(0)}%</span>
                            </div>
                            <Progress value={memPct} tone={usageTone(memPct)} className="h-1" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="Backups" icon={<Archive />} actions={<ViewAll href="/backups" label="View" />} />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border">
              {[
                { label: "Stored", value: backupAgg._count },
                { label: "Total size", value: formatBytes(Number(backupAgg._sum.sizeBytes ?? 0)) },
                { label: "Last backup", value: lastBackup ? timeAgo(lastBackup.completedAt) : "Never" },
                { label: "Failed (24h)", value: failedBackups, danger: failedBackups > 0 },
              ].map((x) => (
                <div key={x.label} className="bg-surface px-5 py-3.5">
                  <div className="text-[11px] text-subtle">{x.label}</div>
                  <div className={`mt-1 truncate text-sm font-semibold tabular ${x.danger ? "text-danger" : ""}`}>{x.value}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
