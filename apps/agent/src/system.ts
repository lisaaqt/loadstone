import fs from "node:fs/promises";
import os from "node:os";
import { AGENT_VERSION, type SystemInfo } from "@loadstone/shared";
import { config } from "./config.js";
import { dockerSummary } from "./docker.js";

let lastSample = os.cpus().map((c) => c.times);
let cpuPercent = 0;

setInterval(() => {
  const current = os.cpus().map((c) => c.times);
  let idle = 0;
  let total = 0;
  current.forEach((t, i) => {
    const p = lastSample[i];
    if (!p) return;
    const dIdle = t.idle - p.idle;
    const dTotal = t.user - p.user + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + dIdle;
    idle += dIdle;
    total += dTotal;
  });
  cpuPercent = total > 0 ? ((total - idle) / total) * 100 : 0;
  lastSample = current;
}, 5000).unref();

async function availableMemory(): Promise<number> {
  try {
    const info = await fs.readFile("/proc/meminfo", "utf8");
    const match = info.match(/^MemAvailable:\s+(\d+) kB/m);
    if (match) return Number(match[1]) * 1024;
  } catch {
    /* not linux */
  }
  return os.freemem();
}

export async function systemInfo(): Promise<SystemInfo> {
  const [disk, docker, available] = await Promise.all([fs.statfs(config.dataDir).catch(() => null), dockerSummary(), availableMemory()]);
  const cpus = os.cpus();
  const total = os.totalmem();
  return {
    agentVersion: AGENT_VERSION,
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model.trim() ?? "unknown",
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memoryTotalBytes: total,
    memoryUsedBytes: total - available,
    diskTotalBytes: disk ? disk.blocks * disk.bsize : 0,
    diskUsedBytes: disk ? (disk.blocks - disk.bavail) * disk.bsize : 0,
    uptimeSeconds: os.uptime(),
    docker,
  };
}
