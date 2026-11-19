"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDownUp, Clock, Cpu, HardDrive, MemoryStick, Terminal } from "lucide-react";
import { SOFTWARE } from "@loadstone/shared";
import { formatBytes, formatCores, formatDate, formatDuration, formatMb, timeAgo } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { KeyValue, Stat } from "@/components/ui/layout";
import { Progress } from "@/components/ui/misc";
import { usageTone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AreaChart, type Point } from "@/components/charts/area-chart";
import { useServer, useServerStatus } from "./use-server";

const HISTORY = 60;

export function ServerOverview({ lastBackupAt, backupCount }: { lastBackupAt: string | null; backupCount: number }) {
  const server = useServer();
  const { data } = useServerStatus(server.id, server.state);
  const stats = data?.stats;
  const [cpu, setCpu] = useState<Point[]>([]);
  const [mem, setMem] = useState<Point[]>([]);
  const lastNet = useRef<{ t: number; rx: number; tx: number } | null>(null);
  const [rate, setRate] = useState<{ rx: number; tx: number }>({ rx: 0, tx: 0 });

  useEffect(() => {
    if (!stats || stats.state !== "running") return;
    const t = Date.now();
    setCpu((h) => [...h, { t, v: stats.cpuPercent }].slice(-HISTORY));
    setMem((h) => [...h, { t, v: stats.memoryBytes }].slice(-HISTORY));
    const prev = lastNet.current;
    if (prev && t > prev.t) {
      const dt = (t - prev.t) / 1000;
      setRate({ rx: Math.max(0, (stats.networkRxBytes - prev.rx) / dt), tx: Math.max(0, (stats.networkTxBytes - prev.tx) / dt) });
    }
    lastNet.current = { t, rx: stats.networkRxBytes, tx: stats.networkTxBytes };
  }, [stats]);

  const memLimit = stats?.memoryLimitBytes || server.memoryMb * 1024 * 1024;
  const memPct = stats ? (stats.memoryBytes / memLimit) * 100 : 0;
  const diskPct = stats ? (stats.diskBytes / (server.diskMb * 1024 * 1024)) * 100 : 0;
  const cpuMax = server.cpuPercent || Math.max(100, ...cpu.map((p) => p.v));
  const uptime = stats?.startedAt && stats.state !== "offline" ? (Date.now() - new Date(stats.startedAt).getTime()) / 1000 : null;

  return (
    <>
      {server.state === "ERROR" && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 text-danger" />
          <div>
            <div className="font-medium text-foreground">Installation failed</div>
            <div className="mt-0.5 font-mono text-xs text-muted">{server.installError ?? "Unknown error"}</div>
            <div className="mt-1 text-xs text-muted">Fix the configuration and press Start to retry provisioning.</div>
          </div>
        </div>
      )}
      {data?.error && server.state !== "ERROR" && server.state !== "INSTALLING" && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/25 bg-warning/10 px-4 py-2.5 text-[13px]">
          <AlertTriangle className="size-4 text-warning" />
          <span className="text-muted">Live stats unavailable: {data.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="CPU"
          icon={Cpu}
          value={stats ? `${stats.cpuPercent.toFixed(1)}%` : "—"}
          sub={server.cpuPercent ? `Limit ${server.cpuPercent}% (${formatCores(server.cpuPercent)})` : "No limit"}
        >
          <Progress value={stats ? (stats.cpuPercent / cpuMax) * 100 : 0} tone={usageTone(stats ? (stats.cpuPercent / cpuMax) * 100 : 0)} />
        </Stat>
        <Stat label="Memory" icon={MemoryStick} value={stats ? formatBytes(stats.memoryBytes) : "—"} sub={`of ${formatBytes(memLimit)}`}>
          <Progress value={memPct} tone={usageTone(memPct)} />
        </Stat>
        <Stat label="Storage" icon={HardDrive} value={stats ? formatBytes(stats.diskBytes) : "—"} sub={`of ${formatMb(server.diskMb)}`}>
          <Progress value={diskPct} tone={usageTone(diskPct)} />
        </Stat>
        <Stat
          label="Network"
          icon={ArrowDownUp}
          value={stats?.state === "running" ? `${formatBytes(rate.rx)}/s` : "—"}
          sub={stats?.state === "running" ? `↑ ${formatBytes(rate.tx)}/s · uptime ${uptime ? formatDuration(uptime) : "—"}` : "Server offline"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="CPU" description="Live, last few minutes" />
          <div className="p-4">
            <AreaChart data={cpu} max={Math.max(cpuMax, 1)} height={110} unit="percent" emptyLabel="Waiting for samples" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Memory" description="Live, last few minutes" />
          <div className="p-4">
            <AreaChart data={mem} max={memLimit} height={110} unit="bytes" color="var(--info)" emptyLabel="Waiting for samples" />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Details"
            actions={
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/servers/${server.id}/console`}>
                  <Terminal /> Console
                </Link>
              </Button>
            }
          />
          <div className="divide-y divide-border px-4 py-1">
            <KeyValue label="Software">
              {SOFTWARE[server.software].label}
              {SOFTWARE[server.software].usesMinecraftVersion && ` ${server.mcVersion}`}
            </KeyValue>
            <KeyValue label="Image" mono>
              {server.image}
            </KeyValue>
            <KeyValue label="Owner">{server.ownerName}</KeyValue>
            <KeyValue label="Last backup">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3 text-muted" />
                {lastBackupAt ? timeAgo(lastBackupAt) : "Never"} · {backupCount} stored
              </span>
            </KeyValue>
            <KeyValue label="Created">{formatDate(server.createdAt)}</KeyValue>
          </div>
        </Card>
      </div>
    </>
  );
}
